-- ════════════════════════════════════════════════════════════════════
-- Swarnix Studio — PRD build (P0-2, P0-4, P1-1, P1-2, P2-1)
-- Applied to production 31 Jul 2026 as seven migrations, collected here
-- in apply order for version control:
--   studio_free_quota_10_and_credit_grade
--   studio_clean_download_gate
--   studio_hide_clean_public_id_column
--   studio_generation_events
--   studio_analytics_dashboard
--   studio_collections_and_batches
--   studio_revoke_anon_execute
--
-- Every statement is additive (new tables / new nullable columns) and safe to
-- run against a live database. No destructive ALTER, no renames, no drops.
-- ════════════════════════════════════════════════════════════════════

-- ── P0-2: free grant 3 → 10, and credit grade per image ─────────────
-- free_quota is a single global row read live by app_reserve_credits /
-- app_tryons_remaining, so bumping it applies to everyone. That is intentional:
-- all existing accounts are the owner's test users, not paying customers.
update public.app_pricing
   set free_quota = 10, updated_at = now()
 where key = 'default';

-- Grade of the credit that paid for a gallery image. 'free' output is served
-- watermarked; 'paid' is clean. Existing rows default to 'paid' so nothing
-- already generated becomes retroactively watermarked.
alter table public.app_gallery
  add column if not exists credit_grade text not null default 'paid'
    check (credit_grade in ('free', 'paid'));

-- The clean (un-watermarked) Cloudinary public_id for free-grade output.
alter table public.app_gallery
  add column if not exists clean_public_id text;

-- Has this account ever spent a PAID credit? That is the unlock condition for
-- clean downloads of everything made on free credits.
--
-- Deliberately keyed off paid-credit *spend*, not purchase history: existing
-- users hold paid_credits granted manually/by referral with zero completed
-- transactions, and referral credits are paid-grade by design. Keying off
-- app_transactions would wrongly watermark all of them.
create or replace function public.app_has_paid_grade(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.app_gallery
     where user_id = p_user and credit_grade = 'paid'
  );
$$;

-- Reveal the clean public_id for one row, but only once the account qualifies.
create or replace function public.app_clean_public_id(p_gallery_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_clean text;
begin
  select user_id, clean_public_id into v_owner, v_clean
    from public.app_gallery where id = p_gallery_id;

  if v_owner is null or v_owner <> auth.uid() then
    return null;                                  -- not yours (or gone)
  end if;
  if not public.app_has_paid_grade(v_owner) then
    return null;                                  -- still on free credits
  end if;
  return v_clean;
end $$;

-- RLS is row-level: the existing gallery_all_own policy (auth.uid() = user_id)
-- lets an owner read EVERY column of their own rows, clean_public_id included.
-- That would defeat app_clean_public_id() entirely. Column-level privileges are
-- the tool for this — revoke table-wide SELECT, grant it back per column.
revoke select on public.app_gallery from authenticated, anon;

grant select (id, user_id, job_id, image_url, title, created_at, kind, credit_grade)
  on public.app_gallery to authenticated;

grant insert, update, delete on public.app_gallery to authenticated;

-- ── P0-4: generation analytics ──────────────────────────────────────
-- One row per generation attempt, including failures. Deliberately a plain log,
-- not a foreign-keyed fact table: writes are fire-and-forget from the client and
-- must never block or fail a generation.
create table if not exists public.app_generation_events (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid(),
  created_at          timestamptz not null default now(),

  feature             text not null,          -- studio_photo|metal_swap|ai_model|design|reel
  status              text not null default 'ok' check (status in ('ok','failed')),

  source_image_hash   text,
  credit_grade        text check (credit_grade in ('free','paid')),
  credits_consumed    integer not null default 0,

  downloaded_at       timestamptz,
  shared_at           timestamptz,
  regenerated_from_id uuid,

  model_used          text,
  latency_ms          integer,
  provider_cost_usd   numeric(10,5)
);

alter table public.app_generation_events enable row level security;

drop policy if exists gen_events_own on public.app_generation_events;
create policy gen_events_own on public.app_generation_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists gen_events_user_created_idx
  on public.app_generation_events (user_id, created_at desc);
create index if not exists gen_events_source_idx
  on public.app_generation_events (user_id, source_image_hash, created_at desc)
  where source_image_hash is not null;

-- Who may read the cross-tenant analytics.
create or replace function public.app_is_studio_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select coalesce(
    (select email = 'nikimodiai@gmail.com' from auth.users where id = auth.uid()),
    false
  );
$$;

-- The whole dashboard in one round trip.
--   accepted        = a successful generation that was downloaded or shared AND
--                     was not retried from the same source within 10 minutes.
--   first_pass_rate = accepted / successful generations, per feature.
create or replace function public.app_studio_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_out jsonb;
begin
  if not public.app_is_studio_admin() then
    raise exception 'not authorised';
  end if;

  with ok_events as (
    select e.*,
           exists (
             select 1 from public.app_generation_events r
              where r.user_id = e.user_id
                and r.source_image_hash is not null
                and r.source_image_hash = e.source_image_hash
                and r.id <> e.id
                and r.created_at > e.created_at
                and r.created_at <= e.created_at + interval '10 minutes'
           ) as retried
    from public.app_generation_events e
    where e.status = 'ok'
  ),
  scored as (
    select *,
           ((downloaded_at is not null or shared_at is not null) and not retried) as accepted
    from ok_events
  ),
  by_feature as (
    select feature,
           count(*)                            as generations,
           count(*) filter (where accepted)    as accepted,
           sum(credits_consumed)               as credits,
           coalesce(sum(provider_cost_usd), 0) as cost_usd
    from scored group by feature
  ),
  purchases as (
    select user_id, created_at,
           row_number() over (partition by user_id order by created_at) as n
    from public.app_transactions
    where status = 'completed' and provider is distinct from 'referral'
  ),
  firsts as (select user_id, created_at as first_at from purchases where n = 1),
  repeats as (
    select f.user_id, f.first_at,
           exists (
             select 1 from purchases p
              where p.user_id = f.user_id and p.n > 1
                and p.created_at <= f.first_at + interval '45 days'
           ) as repeated
    from firsts f
  )
  select jsonb_build_object(
    'by_feature', coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature', feature,
        'generations', generations,
        'accepted', accepted,
        'first_pass_rate', case when generations > 0
                                then round(accepted::numeric / generations, 4) end,
        'credits_per_usable', case when accepted > 0
                                   then round(credits::numeric / accepted, 2) end,
        'credits', credits,
        'cost_usd', round(cost_usd, 4)
      ) order by generations desc) from by_feature), '[]'::jsonb),

    'overall', (
      select jsonb_build_object(
        'generations', count(*),
        'accepted', count(*) filter (where accepted),
        'first_pass_rate', case when count(*) > 0
                                then round((count(*) filter (where accepted))::numeric / count(*), 4) end,
        'credits_per_usable', case when count(*) filter (where accepted) > 0
                                   then round(sum(credits_consumed)::numeric
                                              / (count(*) filter (where accepted)), 2) end,
        'failures', (select count(*) from public.app_generation_events where status = 'failed')
      ) from scored),

    'free_to_paid', (
      select jsonb_build_object(
        'free_users', count(distinct e.user_id),
        'converted', count(distinct e.user_id) filter (
          where exists (select 1 from public.app_transactions t
                         where t.user_id = e.user_id and t.status = 'completed'
                           and t.provider is distinct from 'referral')),
        'rate', case when count(distinct e.user_id) > 0 then round(
          (count(distinct e.user_id) filter (
            where exists (select 1 from public.app_transactions t
                           where t.user_id = e.user_id and t.status = 'completed'
                             and t.provider is distinct from 'referral')))::numeric
          / count(distinct e.user_id), 4) end
      ) from public.app_generation_events e where e.credit_grade = 'free'),

    'repeat_purchase', (
      select jsonb_build_object(
        'first_buyers', count(*),
        'repeated', count(*) filter (where repeated),
        'rate', case when count(*) > 0
                     then round((count(*) filter (where repeated))::numeric / count(*), 4) end
      ) from repeats),

    'cohorts', coalesce((
      select jsonb_agg(c order by c->>'week')
      from (
        select jsonb_build_object(
          'week', to_char(date_trunc('week', first_at), 'YYYY-MM-DD'),
          'first_buyers', count(*),
          'repeated', count(*) filter (where repeated)
        ) as c
        from repeats group by date_trunc('week', first_at)
      ) t), '[]'::jsonb),

    -- Revenue is the ex-GST base (app_transactions.amount), matching how the
    -- referral threshold reads it.
    'revenue', (
      select jsonb_build_object(
        'gross_ex_gst', coalesce(sum(amount), 0),
        'transactions', count(*)
      ) from public.app_transactions
      where status = 'completed' and provider is distinct from 'referral')
  ) into v_out;

  return v_out;
end $$;

-- ── P1-2 Collections + P1-1 Batches ─────────────────────────────────
-- Gemini exposes no reliable seed for reproducible faces, so consistency comes
-- from passing the first generated model image back as a reference on every
-- subsequent generation in the collection.
create table if not exists public.app_collections (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid(),
  name                 text not null,
  model_reference_url  text,
  model_params         jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.app_collections enable row level security;
drop policy if exists collections_own on public.app_collections;
create policy collections_own on public.app_collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists collections_user_idx
  on public.app_collections (user_id, created_at desc);

create table if not exists public.app_batches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  collection_id uuid references public.app_collections(id) on delete set null,
  feature       text not null,
  settings      jsonb not null default '{}'::jsonb,
  status        text not null default 'running'
                check (status in ('running','done','failed')),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

alter table public.app_batches enable row level security;
drop policy if exists batches_own on public.app_batches;
create policy batches_own on public.app_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists batches_user_idx
  on public.app_batches (user_id, created_at desc);

-- One row per piece. Written up-front (all 'queued'), then updated as each
-- piece resolves — which is what lets the user close the tab and still find
-- the results.
create table if not exists public.app_batch_items (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.app_batches(id) on delete cascade,
  user_id         uuid not null default auth.uid(),
  position        integer not null,
  label           text,
  source_url      text not null,
  result_url      text,
  gallery_id      uuid,
  status          text not null default 'queued'
                  check (status in ('queued','generating','done','failed')),
  error           text,
  credit_refunded boolean not null default false,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

alter table public.app_batch_items enable row level security;
drop policy if exists batch_items_own on public.app_batch_items;
create policy batch_items_own on public.app_batch_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists batch_items_batch_idx
  on public.app_batch_items (batch_id, position);

-- Tie generated images back to their batch/collection so the library can group
-- them instead of scattering ten loose entries.
alter table public.app_gallery
  add column if not exists batch_id uuid,
  add column if not exists collection_id uuid;

-- Newly added columns need an explicit SELECT grant: the table-wide grant was
-- revoked above to hide clean_public_id.
grant select (batch_id, collection_id) on public.app_gallery to authenticated;

-- ── Grants ──────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to anon + authenticated by default.
-- None of these are exploitable by a logged-out visitor (each is gated on
-- auth.uid()), but there is no reason for an unauthenticated caller to reach an
-- analytics rpc or a download-unlock gate at all.
grant execute on function public.app_clean_public_id(uuid) to authenticated;
grant execute on function public.app_has_paid_grade(uuid)  to authenticated;
grant execute on function public.app_is_studio_admin()     to authenticated;
grant execute on function public.app_studio_analytics()    to authenticated;

revoke execute on function public.app_clean_public_id(uuid)  from anon;
revoke execute on function public.app_has_paid_grade(uuid)   from anon;
revoke execute on function public.app_is_studio_admin()      from anon;
revoke execute on function public.app_studio_analytics()     from anon;

revoke execute on function public.app_clean_public_id(uuid)  from public;
revoke execute on function public.app_studio_analytics()     from public;
revoke execute on function public.app_has_paid_grade(uuid)   from public;
revoke execute on function public.app_is_studio_admin()      from public;
