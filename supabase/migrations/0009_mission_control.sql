-- Mission Control (Filipe 2026-07-17): the studio becomes the factory's remote control.
-- commands = website -> PC bus (PC acks via service key, ~2-min cron pickup).
-- orders = production orders + the copy pool (kind=copy, status=pool). Sufficiency rule:
-- daily copy quota N requires >= N un-copied references in the pool.

create table if not exists public.commands (
  id bigint generated always as identity primary key,
  type text not null check (type in ('order_produce','pause_auto','resume_auto','set_goal','run_feedback_intake')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','picked_up','done','failed')),
  result text,
  created_at timestamptz not null default now(),
  picked_up_at timestamptz,
  done_at timestamptz
);
create index if not exists ix_commands_pending on public.commands (created_at) where status = 'pending';

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('copy','scratch')),
  format text,                                   -- scratch: 'A'|'B'|'callout'|'debunk'|... ; copy: null
  adaptation text not null default 'bridge' check (adaptation in ('bridge','verbatim','full')),
  reference_path text,                           -- storage: references/<id>.mp4 (copy orders)
  reference_url text,                            -- original link when known
  notes text,
  status text not null default 'pool' check (status in ('pool','queued','in_production','produced','failed','canceled')),
  video_id uuid references public.videos on delete set null,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  produced_at timestamptz
);
create index if not exists ix_orders_pool on public.orders (kind, status, priority desc, created_at);

alter table public.commands enable row level security;
alter table public.orders enable row level security;
drop policy if exists commands_read   on public.commands;
drop policy if exists commands_insert on public.commands;
drop policy if exists orders_read     on public.orders;
drop policy if exists orders_insert   on public.orders;
drop policy if exists orders_update   on public.orders;
create policy commands_read   on public.commands for select to authenticated using (true);
create policy commands_insert on public.commands for insert to authenticated with check (true);
create policy orders_read     on public.orders   for select to authenticated using (true);
create policy orders_insert   on public.orders   for insert to authenticated with check (true);
create policy orders_update   on public.orders   for update to authenticated using (true) with check (true);

-- browser may upload reference videos under references/
drop policy if exists media_reference_write  on storage.objects;
drop policy if exists media_reference_update on storage.objects;
create policy media_reference_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and name like 'references/%');
create policy media_reference_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and name like 'references/%');

notify pgrst, 'reload schema';
