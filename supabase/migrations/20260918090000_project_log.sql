-- 20260918090000_project_log.sql
-- The record Raj's Claude reads. Chat threads get lost and .md files get
-- forgotten; this is queryable, dated, and lives beside the data it describes.
create table
    if not exists project_log (
        id uuid primary key default gen_random_uuid (),
        kind text not null,
        ref text,
        title text not null,
        detail text,
        evidence text,
        status text not null default 'done',
        owner text,
        blocked_on text,
        occurred_on date not null default current_date,
        created_at timestamptz not null default now ()
    );

comment on table project_log is 'Progress and verification record for Able OS, read over MCP.';

comment on column project_log.kind is 'verification | build | fix | finding | decision';

comment on column project_log.ref is 'Row number from the verification work order, where one applies.';

comment on column project_log.evidence is 'What proves it - a query result, a commit, a screenshot name.';

comment on column project_log.status is 'done | open | blocked | superseded';

comment on column project_log.blocked_on is 'Who or what it waits on. Null when nothing does.';

create index if not exists project_log_kind_idx on project_log (kind);

create index if not exists project_log_status_idx on project_log (status);

create index if not exists project_log_occurred_idx on project_log (occurred_on desc);

alter table project_log enable row level security;

create policy "Raj and Dane read the log" on project_log for
select
    using (
        exists (
            select
                1
            from
                profiles
            where
                profiles.id = auth.uid ()
                and profiles.cockpit in ('raj', 'dane')
        )
    );