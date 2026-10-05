-- Problems residents report about the portal itself. Server-only.
create table if not exists public.portal_feedback (
    id uuid primary key default gen_random_uuid(),
    lot_id uuid not null references public.lots (id) on delete cascade,
    kind text not null check (kind in ('button', 'looks_wrong', 'cant_find', 'other')),
    message text,
    photo_path text,
    page text,
    device text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by text
);
create index if not exists portal_feedback_open
    on public.portal_feedback (created_at desc) where resolved_at is null;
alter table public.portal_feedback enable row level security;
