-- ── Referral program ─────────────────────────────────────────────────
-- Reward BOTH sides only when the referred user completes their FIRST real
-- purchase (an app_transactions insert), never on signup alone. This is the
-- key anti-abuse design: app_transactions is only ever inserted by the
-- Razorpay verify edge function (service role — no client INSERT policy
-- exists on it), so a client cannot forge a "purchase" to trigger a reward.
-- Faking a referral would require actually paying Razorpay real money for
-- less credit value back, which kills self-referral farming with throwaway
-- Google accounts.
--
-- Extra abuse guards:
--   - signup_fingerprint: a coarse, non-PII hash (set client-side from a
--     stable browser/localStorage id) stored per user at signup. A referral
--     is auto-blocked if the referred user's fingerprint matches the
--     referrer's own — catches "same laptop, two tabs" self-referral.
--   - REFERRAL_CAP: a referrer can only ever be rewarded for a bounded
--     number of referrals, capping worst-case exposure even if some fraud
--     slips through the fingerprint check.

-- 1. Referral code lives on the profile — short, unique, generated lazily
--    the first time a user opens the Referrals screen.
alter table public.app_profiles
  add column if not exists referral_code text unique,
  add column if not exists signup_fingerprint text;

-- 2. The referral ledger. One row per (referrer, referred) pair.
create table if not exists public.app_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.app_profiles(id) on delete cascade,
  referred_id uuid not null unique references public.app_profiles(id) on delete cascade,
  referral_code text not null,
  signup_fingerprint text,
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'blocked')),
  block_reason text,
  credits_awarded int not null default 0,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  constraint app_referrals_not_self check (referrer_id <> referred_id)
);

create index if not exists app_referrals_referrer_idx on public.app_referrals(referrer_id);

alter table public.app_referrals enable row level security;

-- Either side of a referral can see their own row (referrer tracking their
-- invites; referred user seeing "you were referred"). No client INSERT/UPDATE
-- policy — rows are created/updated only via the SECURITY DEFINER RPCs below.
drop policy if exists app_referrals_select_own on public.app_referrals;
create policy app_referrals_select_own on public.app_referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- 3. Reward amounts + the cap on how many referrals one referrer can be paid
--    for. Kept as SQL constants (not a table) — change here if pricing shifts.
--    10 credits each side, capped at 10 rewarded referrals per referrer
--    (worst case ₹0 direct cost beyond 100 credits, i.e. bounded exposure).
create or replace function public.app_referral_reward_credits() returns int
  language sql immutable as $$ select 10 $$;

create or replace function public.app_referral_cap() returns int
  language sql immutable as $$ select 10 $$;

-- 4. Generate (or return the existing) referral code for the calling user.
--    8-char base32-ish code from the user id + a random suffix, re-rolled on
--    the rare unique-violation collision.
create or replace function public.app_get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_existing text;
begin
  select referral_code into v_existing from public.app_profiles where id = auth.uid();
  if v_existing is not null then
    return v_existing;
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
    begin
      update public.app_profiles set referral_code = v_code where id = auth.uid();
      return v_code;
    exception when unique_violation then
      -- collision on v_code — loop and try another
    end;
  end loop;
end;
$$;

-- 5. Record a referral at signup time. Called once, right after a NEW user's
--    first sign-in, with the referral code from their invite link (if any)
--    and a client-supplied signup fingerprint. All-or-nothing no-ops (does
--    NOT throw) for any invalid/self/duplicate case so a bad or replayed call
--    never breaks onboarding.
create or replace function public.app_record_referral(
  p_referral_code text,
  p_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_referrer_fp text;
  v_status text := 'pending';
  v_block_reason text;
begin
  if p_referral_code is null or length(trim(p_referral_code)) = 0 then
    return; -- no code presented — nothing to record
  end if;

  -- Store this user's own fingerprint for future self-referral checks
  -- (someone might refer THEM later).
  if p_fingerprint is not null then
    update public.app_profiles set signup_fingerprint = p_fingerprint where id = auth.uid();
  end if;

  select id, signup_fingerprint into v_referrer_id, v_referrer_fp
  from public.app_profiles
  where referral_code = upper(trim(p_referral_code));

  if v_referrer_id is null or v_referrer_id = auth.uid() then
    return; -- unknown code, or referring self by code — silently ignore
  end if;

  -- Already has a referral row (re-entry / already referred by someone else).
  if exists (select 1 from public.app_referrals where referred_id = auth.uid()) then
    return;
  end if;

  -- Same-device signup as the referrer — flag, don't reward.
  if p_fingerprint is not null and v_referrer_fp is not null and p_fingerprint = v_referrer_fp then
    v_status := 'blocked';
    v_block_reason := 'fingerprint_match_referrer';
  end if;

  insert into public.app_referrals (referrer_id, referred_id, referral_code, signup_fingerprint, status, block_reason)
  values (v_referrer_id, auth.uid(), upper(trim(p_referral_code)), p_fingerprint, v_status, v_block_reason);
end;
$$;

-- 6. The reward trigger — fires on every app_transactions insert (i.e. every
--    real, server-verified purchase). Only acts if this is the PAYING user's
--    first-ever transaction AND they have a pending, unblocked referral row,
--    AND the referrer hasn't hit their reward cap. Credits both sides via
--    paid_credits (same column app_reserve/refund_credits already manage).
create or replace function public.trg_app_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref record;
  v_prior_purchases int;
  v_rewarded_count int;
  v_amount int := public.app_referral_reward_credits();
begin
  -- Only reward on a successfully completed purchase.
  if new.status is distinct from 'completed' then
    return new;
  end if;

  select r.* into v_ref
  from public.app_referrals r
  where r.referred_id = new.user_id and r.status = 'pending'
  limit 1;

  if v_ref.id is null then
    return new; -- no pending referral for this user
  end if;

  -- Must be their first completed purchase (this row included).
  select count(*) into v_prior_purchases
  from public.app_transactions
  where user_id = new.user_id and status = 'completed' and id <> new.id;
  if v_prior_purchases > 0 then
    return new;
  end if;

  -- Referrer reward cap.
  select count(*) into v_rewarded_count
  from public.app_referrals
  where referrer_id = v_ref.referrer_id and status = 'rewarded';
  if v_rewarded_count >= public.app_referral_cap() then
    update public.app_referrals
       set status = 'blocked', block_reason = 'referrer_cap_reached'
     where id = v_ref.id;
    return new;
  end if;

  -- Credit both sides.
  update public.app_profiles set paid_credits = paid_credits + v_amount, updated_at = now()
   where id = v_ref.referrer_id;
  update public.app_profiles set paid_credits = paid_credits + v_amount, updated_at = now()
   where id = v_ref.referred_id;

  update public.app_referrals
     set status = 'rewarded', credits_awarded = v_amount, rewarded_at = now()
   where id = v_ref.id;

  return new;
end;
$$;

drop trigger if exists app_referral_reward_trigger on public.app_transactions;
create trigger app_referral_reward_trigger
  after insert on public.app_transactions
  for each row
  execute function public.trg_app_referral_reward();
