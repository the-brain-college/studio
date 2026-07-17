-- Client feedback loop (Filipe 2026-07-17): downloads tracked, rejections with reasons,
-- 1-5 star ratings. Feedback is the factory's most important input — stored structured,
-- visible to Filipe, queryable by the factory, acknowledged when processed into contracts.

alter table public.videos add column if not exists downloaded_at timestamptz;

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos on delete cascade,
  kind text not null check (kind in ('reject','rating','note')),
  stars smallint check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz    -- set by the factory when processed into contract changes
);
create index if not exists ix_feedback_video on public.feedback (video_id, created_at);
create index if not exists ix_feedback_unacked on public.feedback (acknowledged_at) where acknowledged_at is null;

alter table public.feedback enable row level security;
drop policy if exists feedback_read on public.feedback;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (true);
create policy feedback_insert on public.feedback for insert to authenticated with check (true);

notify pgrst, 'reload schema';
