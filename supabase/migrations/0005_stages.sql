-- Pipeline debug (Filipe 2026-07-17): per-video record of every team member's work —
-- who ran, when exactly, for how long, outputting what — including parallel stages.
create table if not exists public.stages (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos on delete cascade,
  role text not null,           -- story-artist | screenwriter-frames | screenwriter-video | executor | qa | pooler | webapp-publisher
  task text,                    -- short label of the unit of work
  started_at timestamptz not null,
  finished_at timestamptz not null,
  summary text,                 -- what it output
  created_at timestamptz not null default now()
);
create index if not exists ix_stages_video on public.stages (video_id, started_at);
alter table public.stages enable row level security;
drop policy if exists stages_read on public.stages;
create policy stages_read on public.stages for select to authenticated using (true);
notify pgrst, 'reload schema';
