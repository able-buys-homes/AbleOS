-- 20260907110000_work_orders.sql
--
-- Work orders. The Jobs screen has been a "not built yet" card since the
-- bottom bar was made, and the Map has a dead "New job" button waiting on
-- this table.
--
-- The rule worth putting in the database rather than only in the screen: a
-- job cannot be marked completed without a sentence saying what was fixed and
-- a photo of the finished work. A completed job with no proof is how a repair
-- gets billed, or a resident gets told it was done, when nobody knows whether
-- it was. The constraint below means no code path can get around it.
create table
    if not exists public.work_orders (
        id uuid primary key default gen_random_uuid (),
        lot_id uuid not null references public.lots (id),
        title text not null,
        note text,
        category text not null check (
            category in (
                'plumbing',
                'electrical',
                'hvac',
                'roof',
                'appliance',
                'grounds',
                'other'
            )
        ),
        -- Emergency is not a feeling. No water, no heat in winter, sewage, or a
        -- fire or electrical hazard. The wording lives on the screen.
        priority text not null check (priority in ('emergency', 'urgent', 'routine')),
        status text not null default 'new' check (
            status in (
                'new',
                'assigned',
                'in_progress',
                'completed',
                'cancelled'
            )
        ),
        opened_by text,
        opened_at timestamptz not null default now (),
        assigned_to text,
        -- Close-out
        fix text,
        parts_cost numeric(10, 2),
        hours numeric(5, 2),
        photo_path text,
        completed_at timestamptz,
        completed_by text,
        created_at timestamptz not null default now (),
        updated_at timestamptz not null default now (),
        -- Proof or it is not done.
        constraint work_orders_completed_needs_proof check (
            status <> 'completed'
            or (
                fix is not null
                and photo_path is not null
                and completed_at is not null
            )
        )
    );

create index if not exists work_orders_open_idx on public.work_orders (status, priority, opened_at);

create index if not exists work_orders_lot_idx on public.work_orders (lot_id, status);

alter table public.work_orders enable row level security;

-- The browser holds a Supabase publishable key, so these policies are the
-- defence and not defence in depth.
revoke all on public.work_orders
from
    anon;

grant
select
,
    insert,
update on public.work_orders to authenticated;

grant all on public.work_orders to service_role;

create policy "read work orders" on public.work_orders for
select
    to authenticated using (
        (
            select
                cockpit
            from
                public.profiles
            where
                id = auth.uid ()
        ) in ('zo', 'raj', 'dane')
    );

create policy "open work orders" on public.work_orders for insert to authenticated
with
    check (
        (
            select
                cockpit
            from
                public.profiles
            where
                id = auth.uid ()
        ) in ('zo', 'raj', 'dane')
    );

create policy "work on work orders" on public.work_orders for
update to authenticated using (
    (
        select
            cockpit
        from
            public.profiles
        where
            id = auth.uid ()
    ) in ('zo', 'raj', 'dane')
)
with
    check (
        (
            select
                cockpit
            from
                public.profiles
            where
                id = auth.uid ()
        ) in ('zo', 'raj', 'dane')
    );

-- Deliberately no delete policy. A job that was opened and should not have
-- been gets cancelled, which leaves a record that someone asked.
