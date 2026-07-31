-- ── WhatsApp OTP login ───────────────────────────────────────────────
-- Adds phone as a LOGIN METHOD alongside Google. See docs/WHATSAPP_AUTH_PLAN.md.
--
-- NOTHING here changes the identity model: every app_* table stays keyed on
-- user_id = auth.uid(), and app_profiles.id is still that uid. Supabase's phone
-- provider mints a NEW uid for an unknown number, so the client is responsible
-- for LINKING a phone onto an existing account (updateUser + verifyOtp
-- 'phone_change') rather than letting a Google user acquire a second account.
--
-- What this migration adds is the server half of two problems the client can't
-- solve on its own:
--   1. free credits are per-account, and a burner SIM is cheaper to farm than a
--      burner Gmail  → app_phone_grants + app_claim_phone_grant()
--   2. OTP sends cost real money (~₹0.10-0.15 each, billed by Meta)
--      → app_otp_throttle, written by the send-whatsapp-otp edge function
--
-- Idempotent: safe to re-run.

-- ── 1. Verified-phone flag on the profile ────────────────────────────
-- Denormalised from auth.users so the client can render "verified" without
-- needing to read the auth schema (the anon key can't).
alter table public.app_profiles
  add column if not exists phone_verified_at timestamptz;

-- ── 2. Free-credit grant ledger, keyed by PHONE not by user ──────────
-- Deliberately keyed on the number: that is the whole point. Re-signing up on
-- the same number must not mint another free allowance.
create table if not exists public.app_phone_grants (
  phone_e164    text primary key,
  first_user_id uuid references public.app_profiles(id) on delete set null,
  granted_at    timestamptz not null default now()
);

comment on table public.app_phone_grants is
  'One row per phone number that has ever received a free-credit grant. Service-role only.';

-- ── 3. Manual account-merge audit ────────────────────────────────────
-- v1 has NO self-serve merge (auto-merging on unverified data is an account
-- takeover vector). If support merges two accounts by hand, it gets recorded
-- here rather than happening invisibly in the SQL console.
create table if not exists public.app_account_merges (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null,
  to_user_id   uuid not null,
  merged_by    uuid,
  merged_at    timestamptz not null default now(),
  note         text
);

comment on table public.app_account_merges is
  'Audit trail for manual account merges. Service-role only; no self-serve path in v1.';

-- ── 4. OTP send throttle ─────────────────────────────────────────────
-- Written by the send-whatsapp-otp edge function BEFORE it calls Meta, so an
-- abusive loop costs us nothing. Two scopes: 'phone:<e164>' and 'ip:<addr>'.
create table if not exists public.app_otp_throttle (
  scope        text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  last_sent_at timestamptz,
  primary key (scope, window_start)
);

comment on table public.app_otp_throttle is
  'Rate-limit counters for WhatsApp OTP sends. Service-role only.';

create index if not exists app_otp_throttle_window_idx
  on public.app_otp_throttle (window_start);

-- ── 5. RLS: all three are service-role only ──────────────────────────
-- No client policies at all. A client must never be able to read which numbers
-- exist, who owns them, or who has been merged. With RLS enabled and zero
-- policies, anon/authenticated get nothing; the service role bypasses RLS.
alter table public.app_phone_grants   enable row level security;
alter table public.app_account_merges enable row level security;
alter table public.app_otp_throttle   enable row level security;

-- ── 6. app_claim_phone_grant() ───────────────────────────────────────
-- Called by the client right after the app_profiles upsert, same discipline as
-- app_record_referral: returns a STATUS STRING so the caller can tell a
-- transient failure (retry) from a terminal one (stop).
--
-- Reads the phone from auth.users for the CALLER — never from a parameter, so
-- a client cannot claim a grant against someone else's number.
--
-- Returns:
--   'granted'      → first time this number has been seen; free credits stand
--   'already_used' → number already granted to an earlier account; caller's
--                    free allowance has been zeroed out
--   'no_phone'     → caller has no verified phone (Google-only user); no-op,
--                    they keep the normal free quota
--   'no_profile'   → profile row not committed yet; transient, client retries
create or replace function public.app_claim_phone_grant()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone      text;
  v_existing   uuid;
  v_free_quota integer;
begin
  if auth.uid() is null then
    return 'no_profile';
  end if;

  -- Profile must exist first: app_phone_grants.first_user_id FKs to it, and we
  -- may need to write back to it below.
  if not exists (select 1 from public.app_profiles where id = auth.uid()) then
    return 'no_profile';
  end if;

  -- Authoritative, verified phone for the caller. phone_confirmed_at guards
  -- against an unverified pending phone_change being treated as identity.
  select u.phone into v_phone
  from auth.users u
  where u.id = auth.uid()
    and u.phone is not null
    and u.phone_confirmed_at is not null;

  if v_phone is null or length(trim(v_phone)) = 0 then
    return 'no_phone';
  end if;

  -- Mirror onto the profile so the client can show "verified" cheaply.
  update public.app_profiles
     set phone_verified_at = coalesce(phone_verified_at, now()),
         -- Seed the poster-branding phone if the jeweller hasn't set one; it's
         -- the number they just proved they own.
         store_phone = coalesce(nullif(trim(store_phone), ''), v_phone)
   where id = auth.uid();

  select first_user_id into v_existing
  from public.app_phone_grants
  where phone_e164 = v_phone;

  if v_existing is not null then
    if v_existing = auth.uid() then
      -- Same account re-claiming (re-login, retry). Idempotent no-op.
      return 'granted';
    end if;

    -- This number already consumed a free grant on a different account. Zero
    -- out the new account's free allowance; paid_credits is untouched.
    select free_quota into v_free_quota
    from public.app_pricing
    where key = 'default' and active = true;

    update public.app_profiles
       set free_tryons_used = greatest(free_tryons_used, coalesce(v_free_quota, 10))
     where id = auth.uid();

    return 'already_used';
  end if;

  insert into public.app_phone_grants (phone_e164, first_user_id)
  values (v_phone, auth.uid())
  on conflict (phone_e164) do nothing;

  return 'granted';
end;
$$;

revoke all on function public.app_claim_phone_grant() from public;
grant execute on function public.app_claim_phone_grant() to authenticated;

-- ── 7. Close the referral hole ───────────────────────────────────────
-- Without this, the referral program becomes the farm target instead of the
-- signup bonus: burner SIM → new account → claim referral reward → repeat.
-- A number that has already been granted free credits under a DIFFERENT account
-- cannot also earn a referral reward.
--
-- A number that has already been granted free credits under a DIFFERENT account
-- cannot also earn a referral reward.
create or replace function public.app_phone_already_granted(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.app_phone_grants g on g.phone_e164 = u.phone
    where u.id = p_user
      and u.phone is not null
      and u.phone_confirmed_at is not null
      and g.first_user_id is distinct from p_user
  );
$$;

revoke all on function public.app_phone_already_granted(uuid) from public;
grant execute on function public.app_phone_already_granted(uuid) to authenticated;

-- app_record_referral v6 — identical to v5 except for the phone-reuse check
-- marked below. Restated in full because CREATE OR REPLACE needs the whole body;
-- if v5 is ever re-run after this, re-apply this block.
create or replace function public.app_record_referral(
  p_referral_code text,
  p_fingerprint text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_referrer_fp text;
  v_status text := 'pending';
  v_block_reason text;
  v_my_email text;
  v_my_name text;
  v_have_profile boolean;
begin
  if p_referral_code is null or length(trim(p_referral_code)) = 0 then
    return 'no_code';
  end if;

  select true, email, full_name
    into v_have_profile, v_my_email, v_my_name
  from public.app_profiles where id = auth.uid();
  if not coalesce(v_have_profile, false) then
    return 'no_profile';
  end if;

  if p_fingerprint is not null then
    update public.app_profiles set signup_fingerprint = p_fingerprint where id = auth.uid();
  end if;

  select id, signup_fingerprint into v_referrer_id, v_referrer_fp
  from public.app_profiles
  where referral_code = upper(trim(p_referral_code));

  if v_referrer_id is null or v_referrer_id = auth.uid() then
    return 'invalid';
  end if;

  if exists (select 1 from public.app_referrals where referred_id = auth.uid()) then
    return 'exists';
  end if;

  if p_fingerprint is not null and v_referrer_fp is not null and p_fingerprint = v_referrer_fp then
    v_status := 'blocked';
    v_block_reason := 'fingerprint_match_referrer';
  end if;

  -- NEW in v6: a recycled phone number can't farm referral rewards. Recorded
  -- as 'blocked' rather than rejected so the referrer still sees the signup and
  -- support can audit it — same treatment as a fingerprint match.
  if public.app_phone_already_granted(auth.uid()) then
    v_status := 'blocked';
    v_block_reason := coalesce(v_block_reason, 'phone_already_granted');
  end if;

  insert into public.app_referrals
    (referrer_id, referred_id, referral_code, signup_fingerprint, status, block_reason, referred_email, referred_name)
  values
    (v_referrer_id, auth.uid(), upper(trim(p_referral_code)), p_fingerprint, v_status, v_block_reason, v_my_email, v_my_name);

  return 'recorded';
end;
$$;
