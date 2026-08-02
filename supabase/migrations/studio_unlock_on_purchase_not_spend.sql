-- ════════════════════════════════════════════════════════════════════
-- Swarnix Studio — clean-download unlock keys off PURCHASE, not SPEND
-- Applied to production 2 Aug 2026.
--
-- Fixes: "after buying a 10-credit pack, old AND new images still carry the
-- watermark".
--
-- Two bugs held each other shut:
--
--   1. app_has_paid_grade() asked "does this account have a paid-grade gallery
--      row?" — that is paid-credit SPEND, not purchase. A user who bought a
--      pack but generated nothing since had zero paid-grade rows, so
--      app_clean_public_id() returned null and everything they had made on
--      free credits stayed watermarked forever.
--
--   2. app_reserve_credits() spends the FREE allowance first. A buyer with
--      free credits still in the bucket keeps drawing free-grade charges after
--      paying, so chargeSuiteGraded() graded their NEW output 'free' too. Its
--      "returning paying customer never gets watermarked" escape hatch calls
--      app_has_paid_grade() — which, per bug 1, was still false. So new images
--      were watermarked, which is what kept bug 1 from ever resolving.
--
-- Fixing the unlock condition resolves both: the escape hatch in
-- chargeSuiteGraded() now fires for anyone who has bought, so new output is
-- clean, and old free-grade output unlocks retroactively.
-- ════════════════════════════════════════════════════════════════════

-- The rule we actually sell is "buy any credit pack and everything unlocks
-- clean". So the condition is: has this account ever acquired paid credits?
-- Referral grants count — they are paid-grade by design (the referral_program
-- migrations credit paid_credits, and the prior comment here already treated
-- them as non-watermarking).
--
-- paid_credits > 0 is deliberately part of the test: it catches accounts
-- granted credits manually (support, comps) with no app_transactions row at
-- all, which a transactions-only check would wrongly keep watermarked.
create or replace function public.app_has_paid_grade(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    -- ever completed a credit purchase / referral grant …
    exists (
      select 1 from public.app_transactions
       where user_id = p_user
         and status = 'completed'
         and coalesce(credits_added, 0) > 0
    )
    -- … or currently holds paid credits (manual grant, no transaction row) …
    or coalesce(
         (select paid_credits from public.app_profiles where id = p_user), 0
       ) > 0
    -- … or already has paid-grade output (the original condition, kept so the
    -- historical case of a fully-spent purchase still unlocks).
    or exists (
      select 1 from public.app_gallery
       where user_id = p_user and credit_grade = 'paid'
    );
$$;

-- ── Backfill: free rows whose archiveClean() silently failed ────────
-- saveGeneration() swallowed archive errors and stored clean_public_id = null,
-- so those rows had nothing for the unlock to return even once it worked.
-- The watermark is a delivery transform over the ORIGINAL asset, so the clean
-- image already lives at the same public_id — strip only the l_text watermark
-- segment. Any following delivery transform (e.g. the AI-model c_fill/ar crop)
-- is part of what the user asked for and is preserved.
update public.app_gallery
   set clean_public_id = regexp_replace(
         regexp_replace(
           regexp_replace(split_part(image_url, '/upload/', 2), '^l_text:[^/]*/', ''),
           '^v[0-9]+/', ''),
         '\.[a-zA-Z0-9]+$', ''
       )
 where credit_grade = 'free'
   and clean_public_id is null
   and image_url like '%l_text:Arial%';
