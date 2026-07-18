-- Chat bus (Filipe 2026-07-18): website <-> Claude terminal, over the same Supabase.
-- Filipe types in the studio (sender='filipe', authed insert); the factory brain reads
-- them via tools/factory-chat.cjs / factory-inbox.cjs (service key — bypasses RLS) and
-- replies with sender='claude'. read_at is owned by whoever consumes the message.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender text not null check (sender in ('filipe','claude')),
  text text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ix_chat_unread on public.chat_messages (sender, created_at) where read_at is null;

alter table public.chat_messages enable row level security;
drop policy if exists chat_read   on public.chat_messages;
drop policy if exists chat_insert on public.chat_messages;
create policy chat_read   on public.chat_messages for select to authenticated using (true);
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (sender = 'filipe');
-- service role: full access (bypasses RLS by design)

notify pgrst, 'reload schema';
