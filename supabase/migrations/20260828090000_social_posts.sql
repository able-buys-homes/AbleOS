-- 20260828090000_social_posts.sql
-- Facebook posting queue for rehab stage photos.
--
-- Rehab stages live in Notion and their photos live only in a Drive folder,
-- so there is no per-photo row to join to. A queue row therefore points at a
-- stage, and the review screen lists that stage's Drive folder live.
--
-- Nothing here posts on its own. A row reaching 'pending' only means Raj has
-- approved the stage, so its photos are eligible to be considered.
create table
    if not exists social_queue (
        id uuid primary key default gen_random_uuid (),
        notion_page_id text not null,
        side text not null,
        stage_name text not null,
        drive_folder_id text not null,
        -- pending  : awaiting Raj's review
        -- reviewed : he has been through it, whether or not anything was posted
        -- skipped  : deliberately nothing from this stage
        status text not null default 'pending' check (status in ('pending', 'reviewed', 'skipped')),
        reviewed_by text,
        reviewed_at timestamptz,
        created_at timestamptz not null default now ()
    );

-- One queue row per stage. Re-approving must not create a duplicate.
create unique index if not exists social_queue_stage on social_queue (notion_page_id);

create index if not exists social_queue_pending on social_queue (created_at desc)
where
    status = 'pending';

-- One row per photo actually published. Absence means it was never posted.
create table
    if not exists social_posts (
        id uuid primary key default gen_random_uuid (),
        queue_id uuid not null references social_queue (id) on delete cascade,
        drive_file_id text not null,
        caption text,
        -- The public copy Meta fetches. Only approved images ever land here.
        public_url text,
        platform text not null default 'facebook' check (platform in ('facebook')),
        -- queued -> posted, or failed with a reason. Never silently dropped.
        status text not null default 'queued' check (status in ('queued', 'posted', 'failed')),
        fb_post_id text,
        error text,
        approved_by text,
        posted_at timestamptz,
        created_at timestamptz not null default now ()
    );

-- The same photo must not be posted twice from a retry.
create unique index if not exists social_posts_once on social_posts (queue_id, drive_file_id, platform);

create index if not exists social_posts_by_queue on social_posts (queue_id, created_at);

-- RLS on, no policies. Every read and write goes through the API using the
-- service key, where the raj-only restriction is enforced.
alter table social_queue enable row level security;

alter table social_posts enable row level security;