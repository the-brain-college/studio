-- Meta (FB+IG paired) manual scheduling support (Filipe 2026-07-17): the factory writes
-- the caption; Filipe copies it into Meta Business Suite and marks the video as scheduled
-- there. YT stays automatic. meta_scheduled_at is set/cleared from the browser AFTER the
-- video is already 'scheduled' on YT, so the update policy loosens to all statuses
-- (single trusted user; scheduling state machine is still function-owned in practice).

alter table public.videos add column if not exists meta_caption text;
alter table public.videos add column if not exists meta_scheduled_at timestamptz;

drop policy if exists videos_update on public.videos;
create policy videos_update on public.videos for update to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
