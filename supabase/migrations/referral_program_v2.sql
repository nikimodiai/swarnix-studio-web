-- ── Referral program v2 ──────────────────────────────────────────────
-- Fixes/additions after first real-world test:
--   1. Snapshot the referred user's name/email onto app_referrals at record
--      time, so the referrer's Referrals screen can show "who" without any
--      cross-user RLS read (app_profiles only lets a user read their own row).
--   2. The reward trigger now also writes a synthetic app_transactions row
--      (provider='referral') for BOTH sides, so the bonus shows up in the
--      existing Transaction History screen automatically.
--   3. The "first purchase" check now excludes provider='referral' rows —
--      otherwise the synthetic referral-bonus transaction we just insert
--      would itself count as a "purchase" and could recurse/double-fire.

alter table public.app_referrals
  add column if not exists referred_email text,
  add column if not exists referred_name text;

-- Backfill the snapshot for any pre-existing rows (best effort; only the
-- referrer can normally see this, but as the migration author/service role
-- we can read across profiles here).
update public.app_referrals r
set referred_email = p.email, referred_name = p.full_name
from public.app_profiles p
where p.id = r.referred_id
  and (r.referred_email is null or r.referred_name is null);

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
  v_my_email text;
  v_my_name text;
begin
  if p_referral_code is null or length(trim(p_referral_code)) = 0 then
    return;
  end if;

  if p_fingerprint is not null then
    update public.app_profiles set signup_fingerprint = p_fingerprint where id = auth.uid();
  end if;

  select id, signup_fingerprint into v_referrer_id, v_referrer_fp
  from public.app_profiles
  where referral_code = upper(trim(p_referral_code));

  if v_referrer_id is null or v_referrer_id = auth.uid() then
    return;
  end if;

  if exists (select 1 from public.app_referrals where referred_id = auth.uid()) then
    return;
  end if;

  if p_fingerprint is not null and v_referrer_fp is not null and p_fingerprint = v_referrer_fp then
    v_status := 'blocked';
    v_block_reason := 'fingerprint_match_referrer';
  end if;

  select email, full_name into v_my_email, v_my_name from public.app_profiles where id = auth.uid();

  insert into public.app_referrals
    (referrer_id, referred_id, referral_code, signup_fingerprint, status, block_reason, referred_email, referred_name)
  values
    (v_referrer_id, auth.uid(), upper(trim(p_referral_code)), p_fingerprint, v_status, v_block_reason, v_my_email, v_my_name);
end;
$$;

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
  -- Never treat our own synthetic referral-bonus row as a purchase, and never
  -- re-fire the reward off of it.
  if new.provider = 'referral' then
    return new;
  end if;

  if new.status is distinct from 'completed' then
    return new;
  end if;

  select r.* into v_ref
  from public.app_referrals r
  where r.referred_id = new.user_id and r.status = 'pending'
  limit 1;

  if v_ref.id is null then
    return new;
  end if;

  -- Must be their first completed REAL purchase (excludes referral bonuses).
  select count(*) into v_prior_purchases
  from public.app_transactions
  where user_id = new.user_id
    and status = 'completed'
    and provider is distinct from 'referral'
    and id <> new.id;
  if v_prior_purchases > 0 then
    return new;
  end if;

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

  -- Synthetic transaction rows so the bonus shows in Transaction History for
  -- both sides, exactly like a real purchase row (but amount is null = free).
  insert into public.app_transactions (user_id, provider, credits_added, amount, currency, status)
  values
    (v_ref.referrer_id, 'referral', v_amount, null, 'INR', 'completed'),
    (v_ref.referred_id, 'referral', v_amount, null, 'INR', 'completed');

  update public.app_referrals
     set status = 'rewarded', credits_awarded = v_amount, rewarded_at = now()
   where id = v_ref.id;

  return new;
end;
$$;
