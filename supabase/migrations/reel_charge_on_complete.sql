-- ── Storyboard reels: charge credits ONLY on success ───────────────────────
-- Classic reels keep the reserve-on-submit + refund-on-fail model (unchanged).
-- Storyboard reels instead carry a `credits_cost` on the row and are charged
-- ONLY when the render completes — so a failed reel is never debited, and there
-- is no reserve/refund round-trip that could leave a customer short.
--
-- Disambiguation between the two models on the shared reel_jobs table:
--   credits_cost IS NULL      → classic reel  → reserve-on-submit + refund-on-fail
--   credits_cost IS NOT NULL  → storyboard    → charge-on-complete (this file)
--
-- Idempotent: safe to re-run. Apply via Supabase SQL editor or the CLI.

-- 1. Columns: the amount to charge, and a once-only guard.
alter table public.reel_jobs
  add column if not exists credits_cost   int,
  add column if not exists credits_charged boolean not null default false;

-- 2. Charge-on-complete. Fires on the transition into 'completed' for a
--    storyboard row (credits_cost set) that hasn't been charged yet. Uses
--    app_reserve_credits (free allowance first, then paid) to deduct exactly
--    credits_cost. If the balance is somehow short at completion, the reel is
--    still delivered and simply left uncharged (in the customer's favour) —
--    credits_charged stays false, never a partial or phantom charge.
create or replace function public.app_charge_reel_on_complete()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  if NEW.status is distinct from 'completed'
     or OLD.status is not distinct from 'completed'
     or NEW.credits_cost is null
     or coalesce(NEW.credits_charged, false) then
    return NEW;
  end if;

  select ok into v_ok from public.app_reserve_credits(NEW.credits_cost, NEW.user_id);
  if coalesce(v_ok, false) then
    NEW.credits_charged := true;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_reel_charge_on_complete on public.reel_jobs;
create trigger trg_reel_charge_on_complete
  before update on public.reel_jobs
  for each row execute function public.app_charge_reel_on_complete();

-- 3. Keep refund-on-fail from touching storyboard rows. Storyboard reels are
--    never pre-charged, so a failed one must NEVER be "refunded" (that would
--    fabricate credits). Re-create the classic refund trigger fn with a guard
--    that skips any row carrying a credits_cost. Classic rows (credits_cost
--    NULL) behave exactly as before.
create or replace function public.app_refund_reel_on_fail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rate numeric;
  v_cost int;
begin
  if NEW.status is distinct from 'failed'
     or OLD.status is not distinct from 'failed'
     or NEW.credits_cost is not null            -- storyboard row → never pre-charged
     or coalesce(NEW.credits_refunded, false) then
    return NEW;
  end if;

  v_rate := case NEW.resolution
              when '480p'  then 0.35
              when '720p'  then 0.75
              when '1080p' then 1.6
              else 0.75
            end;
  v_cost := greatest(1, ceil(coalesce(NEW.length_seconds, 0)::numeric * v_rate))::int;

  perform public.app_refund_credits(0, v_cost, NEW.user_id);
  NEW.credits_refunded := true;
  return NEW;
end $$;
