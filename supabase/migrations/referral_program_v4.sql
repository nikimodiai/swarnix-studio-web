-- ── Referral program v4 ──────────────────────────────────────────────
-- Add a MINIMUM QUALIFYING PURCHASE to unlock the referral bonus, to stop
-- referred users from churning through the cheapest ₹149 Starter pack just to
-- farm the 10+10 bonus.
--
-- Rules (per product decision, 2026-07-29):
--   • Minimum qualifying amount = ₹399 (the 'Most Popular' pack). The Starter
--     pack (₹149) no longer unlocks the bonus.
--   • A too-small first purchase does NOT forfeit the bonus. The referral stays
--     'pending'; if the user LATER buys a qualifying (≥₹399) pack, the bonus
--     fires then. So the qualifying event is "first purchase that meets the
--     threshold", not "first purchase at all".

-- Configurable threshold, same pattern as the reward/cap constants.
create or replace function public.app_referral_min_purchase() returns numeric
  language sql immutable as $$ select 399::numeric $$;

create or replace function public.trg_app_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref record;
  v_qualifying_prior int;
  v_rewarded_count int;
  v_amount int := public.app_referral_reward_credits();
  v_min numeric := public.app_referral_min_purchase();
begin
  -- Never treat our own synthetic referral-bonus row as a purchase, and never
  -- re-fire the reward off of it.
  if new.provider = 'referral' then
    return new;
  end if;

  if new.status is distinct from 'completed' then
    return new;
  end if;

  -- This purchase must itself meet the minimum. A smaller purchase (e.g. the
  -- ₹149 Starter) simply isn't the qualifying event — it leaves the referral
  -- 'pending' so a later ≥₹399 purchase can still unlock it.
  if new.amount is null or new.amount < v_min then
    return new;
  end if;

  select r.* into v_ref
  from public.app_referrals r
  where r.referred_id = new.user_id and r.status = 'pending'
  limit 1;

  if v_ref.id is null then
    return new;
  end if;

  -- Must be their FIRST completed purchase that ALSO meets the threshold
  -- (excludes referral bonuses and excludes sub-threshold purchases). This is
  -- what lets an earlier ₹149 buy not "use up" the referral.
  select count(*) into v_qualifying_prior
  from public.app_transactions
  where user_id = new.user_id
    and status = 'completed'
    and provider is distinct from 'referral'
    and amount >= v_min
    and id <> new.id;
  if v_qualifying_prior > 0 then
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
