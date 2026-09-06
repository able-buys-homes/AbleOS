-- 20260906090000_htm_applications.sql
--
-- Where a residency application lands. This table is different in kind from
-- every other table in this schema: it holds the last four of a social
-- security number, a date of birth and a driver's licence number for people
-- who do not live here yet and may never. So it is written closed - RLS on,
-- anon revoked, no delete policy at all - rather than opened later.
--
-- The browser holds a Supabase publishable key and talks to the database
-- directly, so the policies below are not defence in depth. They are the
-- defence.
create table
    if not exists public.htm_applications (
        id uuid primary key default gen_random_uuid (),
        created_at timestamptz not null default now (),
        status text not null default 'submitted' check (
            status in (
                'submitted',
                'reviewing',
                'approved',
                'denied',
                'withdrawn'
            )
        ),
        -- Pulled out of the payload only so the list can be read without opening
        -- the identifying data. Everything else stays inside `data`.
        applicant_name text not null,
        applicant_phone text not null,
        lot_number text,
        applying_for text check (
            applying_for in ('community_home', 'lot_only', 'rent_to_own')
        ),
        -- The whole form as submitted, including SSN last 4, date of birth and
        -- licence number. Never select this column into a list view.
        data jsonb not null,
        taken_by uuid references public.profiles (id),
        reviewed_by uuid references public.profiles (id),
        reviewed_at timestamptz,
        decision_note text
    );

create index if not exists htm_applications_status_idx on public.htm_applications (status, created_at desc);

alter table public.htm_applications enable row level security;

-- No anonymous access of any kind. A publishable key in a browser is a
-- public key; treat it as one.
revoke all on public.htm_applications
from
    anon;

grant
select
,
    insert,
update on public.htm_applications to authenticated;

grant all on public.htm_applications to service_role;

-- Raj and Dane see every application because they make the decision. Zo sees
-- the ones he took himself - he needs to reopen an application he is standing
-- in front of, not read everyone else's. Widen this by adding 'zo' to the
-- list below if that turns out to be wrong in practice.
create policy "read applications" on public.htm_applications for
select
    to authenticated using (
        (
            select
                cockpit
            from
                public.profiles
            where
                id = auth.uid ()
        ) in ('raj', 'dane')
        or taken_by = auth.uid ()
    );

-- Whoever takes the application is recorded as having taken it. The row
-- cannot be created claiming someone else did it.
create policy "create applications" on public.htm_applications for insert to authenticated
with
    check (
        (
            select
                cockpit
            from
                public.profiles
            where
                id = auth.uid ()
        ) in ('raj', 'dane', 'zo')
        and taken_by = auth.uid ()
    );

-- Only the owners record a decision.
create policy "decide applications" on public.htm_applications for
update to authenticated using (
    (
        select
            cockpit
        from
            public.profiles
        where
            id = auth.uid ()
    ) in ('raj', 'dane')
)
with
    check (
        (
            select
                cockpit
            from
                public.profiles
            where
                id = auth.uid ()c
        ) in ('raj', 'dane')
    );

-- Deliberately no delete policy. An application is a record of someone asking
-- to live here; it gets a status, not a deletion.