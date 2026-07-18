-- Videos to Schedule (Filipe 2026-07-18): Filipe uploads a FINISHED video he made himself;
-- the factory analyzes it (full transcript + scene breakdown) and routes it toward YouTube
-- scheduling with a factory-written meta caption. Rides the existing orders bus as kind='schedule'.
-- videos.analysis stores the durable analysis JSON {duration, transcript, scenes, hook, cta}
-- for analytics and the Story Artist's creative-history corpus.

alter table public.orders drop constraint if exists orders_kind_check;
alter table public.orders add constraint orders_kind_check
  check (kind in ('copy','scratch','schedule'));

alter table public.videos add column if not exists analysis jsonb;

-- Editor output (edit-reel.cjs): the auto-edited Final.mp4 lands in storage at
-- finals/<slug>/final.mp4; final_path lets the studio surface it next to the preview.
alter table public.videos add column if not exists final_path text;

notify pgrst, 'reload schema';

alter table public.videos add column if not exists final_size_bytes bigint;
alter table public.videos add column if not exists final_uploaded_at timestamptz;
