-- Rehab stages move from Notion into Supabase (10 Oct 2026).
-- id keeps the old Notion page id so notification links, social_queue and the
-- cockpit screens keep working unchanged. Server-only: no anon/authenticated access.
-- Already run by hand in the SQL editor on 10 Oct 2026.

create table if not exists public.rehab_stages (
    id text primary key,
    stage_name text not null default '',
    side text not null default '',
    phase text not null default '',
    status text not null default 'Not Started',
    work_done boolean not null default false,
    photo_uploaded boolean not null default false,
    drive_photo_link text,
    jeremiah_approved boolean not null default false,
    karen_approved boolean not null default false,
    raj_approved boolean not null default false,
    draw_released boolean not null default false,
    notes text not null default '',
    updated_at timestamptz not null default now(),
    updated_by text
);

-- The legacy Notion deals (hidden since SHOW_NOTION_DEALS = false), kept whole
-- so nothing is lost when Notion goes.
create table if not exists public.notion_deals_archive (
    notion_page_id text primary key,
    properties jsonb not null,
    archived_at timestamptz not null default now()
);

alter table public.rehab_stages enable row level security;
alter table public.notion_deals_archive enable row level security;
revoke all on public.rehab_stages from anon, authenticated;
revoke all on public.notion_deals_archive from anon, authenticated;
