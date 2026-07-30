-- ── Referral program v5 ──────────────────────────────────────────────
-- BUGFIX: referrals were silently lost on signup for some users (no
-- app_referrals row was ever created, so neither the referrer's "pending"
-- entry nor the referred user's Buy-Credits nudge appeared).
--
-- Root cause was a client race + a swallowed error that could never retry:
--   • app_record_referral was called in PARALLEL with the profile upsert. The
--     app_referrals.referred_id FK -> app_profiles means that if the referral
--     RPC ran before the profile row committed, the INSERT failed the FK.
--   • The client set its "already recorded" localStorage guard BEFORE the RPC,
--     and the RPC returned void, so the failure was invisible AND never retried
--     — the referral was lost permanently.
--
-- The client fix records only AFTER loadProfile resolves and latches its guard
-- only on a terminal outcome. This migration is the server half: make the RPC
-- RETURN a status so the client can distinguish a transient 'no_profile' (retry)
-- from terminal outcomes (stop retrying).
--
-- Return values:
--   'recorded' | 'exists' | 'no_code' | 'invalid'  → terminal
--   'no_profile'                                    → transient, client retries

drop function if exists public.app_record_referral(text, text);

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

  -- The caller's own profile must exist first (referred_id FKs to app_profiles,
  -- and we snapshot their email/name from it). If it isn't there yet, tell the
  -- client to retry rather than silently failing.
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

  insert into public.app_referrals
    (referrer_id, referred_id, referral_code, signup_fingerprint, status, block_reason, referred_email, referred_name)
  values
    (v_referrer_id, auth.uid(), upper(trim(p_referral_code)), p_fingerprint, v_status, v_block_reason, v_my_email, v_my_name);

  return 'recorded';
end;
$$;
