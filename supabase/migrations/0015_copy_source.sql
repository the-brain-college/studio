-- Copy side-by-side review (Filipe 2026-07-19): for COPY videos, the reviewer wants the
-- ORIGINAL reference clip shown beside Louis's scene. The Copy Analyst brief already maps each
-- Louis scene to a time-range in the (un-scened) original — the "src t" column. Store that range
-- per scene, plus a denormalized pointer to the source video so the frontend needs no orders join.
--   videos.reference_path present  => this video is a COPY (of that stored reference).
--   scenes.src_start / src_end     => the original's time-range this Louis scene was copied from.
-- The reference is played seeked to [src_start, src_end] (JS in-range loop; media #t end is
-- unreliable) — no physical trim/re-encode. Ranges are auto-computed (speech pauses + shot
-- changes), so the pairing is thematic, not frame-exact.

alter table public.videos add column if not exists reference_path text;

alter table public.scenes add column if not exists src_start numeric;
alter table public.scenes add column if not exists src_end   numeric;
