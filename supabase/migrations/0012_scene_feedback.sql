-- Two-tier feedback (Filipe 2026-07-18): a note can target the whole video, one scene,
-- or the auto-edited final. scene_id/scene_idx pin the scene (idx survives scene deletion);
-- target labels the tier so the factory's intake restates precisely.

alter table public.feedback
  add column if not exists scene_id uuid references public.scenes(id) on delete set null,
  add column if not exists scene_idx int,
  add column if not exists target text not null default 'video' check (target in ('video','scene','final'));

create index if not exists ix_feedback_scene on public.feedback (scene_id) where scene_id is not null;

notify pgrst, 'reload schema';
