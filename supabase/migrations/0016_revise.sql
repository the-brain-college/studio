-- 0016_revise: the third review verdict — "Revise — redo from my notes".
-- A middle path between Approve and Not approve: the factory reworks the video
-- from Filipe's comments and re-ingests it for another review round (reusing the
-- good scenes). Studio drops a `revise_video` command; the video carries a
-- `revising_at` flag so it never looks untouched while the factory reworks it.

-- (a) allow the new command type. A CHECK can't be altered in place — drop + recreate.
alter table public.commands drop constraint commands_type_check;
alter table public.commands add constraint commands_type_check
  check (type in ('order_produce','pause_auto','resume_auto','set_goal','run_feedback_intake','revise_video'));

-- (b) the "being reworked" flag. Cleared to null on re-ingest (video returns to Pending).
alter table public.videos add column if not exists revising_at timestamptz;
