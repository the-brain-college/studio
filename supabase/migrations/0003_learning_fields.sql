-- Learning dataset (Filipe 2026-07-17): every reel must persist the full creative lineage —
-- the idea (videos.story), each scene's frame prompt + Veo prompt, the scenes, and the final.
-- These rows are kept forever (only media files purge), so future models can learn
-- idea -> prompts -> scenes -> human final edit.

alter table public.scenes add column if not exists frame_prompt text;
alter table public.scenes add column if not exists veo_prompt text;

notify pgrst, 'reload schema';
