-- ── Referral program v3 ──────────────────────────────────────────────
-- BUGFIX: rewards never fired on real purchases.
--
-- Root cause: the reward trigger was AFTER INSERT on app_transactions, but a
-- purchase is not COMPLETED by an insert. create-razorpay-order inserts the
-- row as status='pending', and app_complete_purchase (called by
-- verify-razorpay-payment) flips it to 'completed' with an UPDATE. The trigger
-- never saw that transition, so every referral stayed 'pending' forever even
-- after the referred user actually paid.
--
-- Fix: also fire the trigger AFTER UPDATE, specifically on the
-- pending/failed -> completed transition. The reward function is already
-- idempotent (it only acts when a 'pending' referral row exists and marks it
-- 'rewarded' after paying), so re-updates of an already-completed row no-op.

-- Fire on the status -> completed transition too, not just on insert.
-- We keep the same function; it self-guards against double-reward.
drop trigger if exists app_referral_reward_trigger on public.app_transactions;
create trigger app_referral_reward_trigger
  after insert or update of status on public.app_transactions
  for each row
  when (new.status = 'completed')
  execute function public.trg_app_referral_reward();

-- ── Backfill ──────────────────────────────────────────────────────────
-- Reward any referral that is still 'pending' but whose referred user has
-- ALREADY completed a real (non-referral) purchase — these are the referrals
-- that were stranded by the insert-only trigger. This mirrors the trigger's
-- own logic (first real purchase, referrer cap) exactly.
do $$
declare
  v_ref record;
  v_amount int := public.app_referral_reward_credits();
  v_rewarded_count int;
begin
  for v_ref in
    select r.*
    from public.app_referrals r
    where r.status = 'pending'
      and exists (
        select 1 from public.app_transactions t
        where t.user_id = r.referred_id
          and t.status = 'completed'
          and t.provider is distinct from 'referral'
      )
  loop
    -- Respect the referrer cap, same as the trigger.
    select count(*) into v_rewarded_count
    from public.app_referrals
    where referrer_id = v_ref.referrer_id and status = 'rewarded';

    if v_rewarded_count >= public.app_referral_cap() then
      update public.app_referrals
         set status = 'blocked', block_reason = 'referrer_cap_reached'
       where id = v_ref.id;
      continue;
    end if;

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
  end loop;
end $$;
