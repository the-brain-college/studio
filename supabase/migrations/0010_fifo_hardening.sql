-- FIFO hardening (2026-07-17): the production bus gets a change clock and a fast head.
-- orders.updated_at feeds the stuck-order watchdog (in_production rows that stop moving);
-- the partial index makes the ripe-head lookup and the atomic claim cheap at any queue size.

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create index if not exists ix_orders_queued_head
  on public.orders (status, priority desc, created_at) where status = 'queued';

notify pgrst, 'reload schema';
