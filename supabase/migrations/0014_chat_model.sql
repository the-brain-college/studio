-- Chat: record which Claude model sent each reply (Filipe 2026-07-18).
-- null on filipe rows and on legacy claude rows sent before this column existed.
alter table public.chat_messages add column if not exists model text;
notify pgrst, 'reload schema';
