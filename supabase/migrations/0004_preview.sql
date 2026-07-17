-- Preview reel (Filipe 2026-07-17): a real post-made video per reel — the 4 scenes concatenated
-- with burned captions at reduced quality — for one-click preview before editing. Not production.
alter table public.videos add column if not exists preview_path text;
notify pgrst, 'reload schema';
