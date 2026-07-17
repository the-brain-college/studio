-- Approve/revert flow (Filipe 2026-07-17): Approve is the verdict (downloads follow it),
-- downloaded_at stays as the file-transfer fact ("Already downloaded" badge). Rejections
-- become retractable — every state move must be reversible with a simple flow.

alter table public.videos add column if not exists approved_at timestamptz;
alter table public.feedback add column if not exists retracted_at timestamptz;

-- videos already downloaded were implicitly approved
update public.videos set approved_at = downloaded_at where approved_at is null and downloaded_at is not null;

drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback for update to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
