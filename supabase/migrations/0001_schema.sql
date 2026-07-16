-- The Brain College webapp — schema v1 (2026-07-16)
-- Single trusted user (authenticated role) reads everything and updates only browser-legitimate
-- fields; the factory PC and Netlify functions write with the service-role key (bypasses RLS).

-- ============================= tables =============================

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text,
  description text,
  story text,
  mode text,
  backlog_ref text,
  made_date date,
  scene_count int not null default 0,
  status text not null default 'ingested' check (status in ('ingested','edited','scheduled','published')),
  local_master_path text,
  thumb_path text,
  final_path text,
  final_size_bytes bigint,
  final_uploaded_at timestamptz,
  scenes_purged_at timestamptz,
  final_purged_at timestamptz,
  qc jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_videos_status on public.videos (status);
create index if not exists ix_videos_created on public.videos (created_at desc);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos on delete cascade,
  idx smallint not null,
  kind text,
  spoken text,
  storage_path text,
  size_bytes bigint,
  duration_s numeric,
  qc_verdict text,
  qc_failure_class text,
  created_at timestamptz not null default now(),
  unique (video_id, idx)
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos on delete cascade,
  platform text not null default 'youtube' check (platform in ('youtube','facebook','instagram')),
  slot_date date not null,
  slot_index smallint not null check (slot_index in (0,1,2)),
  publish_at timestamptz not null,
  youtube_video_id text,
  state text not null default 'pending' check (state in ('pending','scheduled','published','failed','canceled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  published_at_actual timestamptz,
  unique (platform, slot_date, slot_index)
);
create unique index if not exists ux_schedules_live_per_video
  on public.schedules (video_id, platform) where state in ('pending','scheduled','published');
create index if not exists ix_schedules_anchor on public.schedules (platform, slot_date desc, slot_index desc);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  video_id uuid references public.videos on delete set null,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_events_type_time on public.events (type, created_at);

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_videos_touch on public.videos;
create trigger trg_videos_touch before update on public.videos
  for each row execute function public.touch_updated_at();

-- ============================= views =============================

create or replace view public.analytics_summary as
select
  (select count(*) from public.videos)                                          as videos_total,
  (select count(*) from public.videos where status = 'ingested')                as ingested,
  (select count(*) from public.videos where status = 'edited')                  as edited,
  (select count(*) from public.videos where status = 'scheduled')               as scheduled,
  (select count(*) from public.videos where status = 'published')               as published,
  (select count(*) from public.videos where created_at > now() - interval '30 days') as videos_30d,
  (select count(*) from public.schedules where state = 'scheduled')             as queue_depth;

create or replace view public.qc_rates as
select
  count(*) filter (where qc is not null)                                        as videos_with_qc,
  coalesce(sum((qc->>'pass')::int), 0)                                          as checks_passed,
  coalesce(sum((qc->>'fail')::int), 0)                                          as checks_failed
from public.videos;

-- ============================= RLS =============================

alter table public.videos    enable row level security;
alter table public.scenes    enable row level security;
alter table public.schedules enable row level security;
alter table public.events    enable row level security;
alter table public.app_state enable row level security;

drop policy if exists videos_read    on public.videos;
drop policy if exists videos_update  on public.videos;
drop policy if exists scenes_read    on public.scenes;
drop policy if exists schedules_read on public.schedules;
drop policy if exists events_read    on public.events;
drop policy if exists events_insert  on public.events;
drop policy if exists app_state_read on public.app_state;

create policy videos_read    on public.videos    for select to authenticated using (true);
create policy videos_update  on public.videos    for update to authenticated using (true)
  with check (status in ('ingested','edited'));  -- browser may edit metadata + mark edited; scheduling states are function-only
create policy scenes_read    on public.scenes    for select to authenticated using (true);
create policy schedules_read on public.schedules for select to authenticated using (true);
create policy events_read    on public.events    for select to authenticated using (true);
create policy events_insert  on public.events    for insert to authenticated with check (true);
create policy app_state_read on public.app_state for select to authenticated using (true);

-- ============================= storage =============================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists media_read        on storage.objects;
drop policy if exists media_final_write on storage.objects;
drop policy if exists media_final_update on storage.objects;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media');
create policy media_final_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and name like 'finals/%');
create policy media_final_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and name like 'finals/%')
  with check (bucket_id = 'media' and name like 'finals/%');
