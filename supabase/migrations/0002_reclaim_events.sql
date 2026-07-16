-- The reused project carried a legacy web-analytics table named 'events' (25k rows of page
-- tracking from its former life). Preserve it under a new name; create the factory's events
-- table as designed in 0001. (0001's `if not exists` had silently kept the legacy table and
-- attached ix_events_type_time to it — that index moves with the rename, so drop it there.)

alter table if exists public.events rename to legacy_web_events;
drop index if exists public.ix_events_type_time;

create table public.events (
  id bigint generated always as identity primary key,
  video_id uuid references public.videos on delete set null,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index ix_factory_events_type_time on public.events (type, created_at);

alter table public.events enable row level security;
alter table public.legacy_web_events enable row level security; -- locked away: no policies

create policy events_read   on public.events for select to authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (true);

notify pgrst, 'reload schema';
