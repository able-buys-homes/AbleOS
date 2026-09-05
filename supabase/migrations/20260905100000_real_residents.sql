-- The real residents of Hometown Meadows, replacing the seeded sample rows.
--
-- Names and units only. No rent, no balances, no ledger. Zo and the team know
-- the real amounts and they are not in this list, so nothing here invents
-- one. Payment status comes from payments Zo logs, not from a balance
-- computed against charges that do not exist.
--
-- Standing rule from the collections spec still holds: the roll is confirmed
-- unit by unit from the lease and Zo's walk. This gives Raj visibility into
-- who has paid. It does not make these rows financially authoritative.
-- Designations from the list. HUD is already carried by hap_household.
alter table public.lots
add column if not exists resident_role text check (resident_role in ('manager', 'daughter'));

comment on column public.lots.resident_role is 'Manager or daughter, as supplied on the resident list. A daughter may be an occupant rather than the leaseholder - confirm before any notice is issued in her name.';

-- ---------------------------------------------------------------------------
-- Remove the sample rows and everything hanging off them.
--
-- This is the one hard delete in this schema and it is deliberate. The
-- insert-only rule protects a real audit trail; these rows are invented
-- people with invented money and keeping them would be the actual risk.
-- Children go first - every lot_id foreign key is NO ACTION, so a lot with
-- payments attached cannot be removed while they exist.
-- ---------------------------------------------------------------------------
delete from public.plan_installments
where
    plan_id in (
        select
            id
        from
            public.payment_plans
        where
            lot_id in (
                select
                    id
                from
                    public.lots
                where
                    is_sample
            )
    );

delete from public.payment_plans
where
    lot_id in (
        select
            id
        from
            public.lots
        where
            is_sample
    );

delete from public.eviction_cases
where
    lot_id in (
        select
            id
        from
            public.lots
        where
            is_sample
    );

delete from public.notices
where
    lot_id in (
        select
            id
        from
            public.lots
        where
            is_sample
    );

delete from public.payments
where
    lot_id in (
        select
            id
        from
            public.lots
        where
            is_sample
    );

delete from public.rent_ledger
where
    lot_id in (
        select
            id
        from
            public.lots
        where
            is_sample
    );

delete from public.lots
where
    is_sample;

-- ---------------------------------------------------------------------------
-- The real list. on conflict does nothing, so re-running is safe and the
-- unique index on (property, lot_number) makes duplicates impossible.
--
-- tenancy_type is left null wherever it is genuinely unknown. Only Lot 16 is
-- documented - the site plan records it as a resident-owned home on lot rent.
-- Guessing the rest would decide the recovery branch by accident, and a
-- lot-only tenancy recovers the lot, never the home.
-- ---------------------------------------------------------------------------
insert into
    public.lots (
        lot_number,
        tenant_name,
        hap_household,
        tenancy_type,
        resident_role,
        occupied,
        notes
    )
values
    (
        '1',
        'Jeffery Dowey',
        false,
        null,
        null,
        true,
        null
    ),
    (
        '2',
        'Porsha Whitmore',
        false,
        null,
        null,
        true,
        'Unconfirmed. The site plan has this home rent-ready; this record comes from the August A/R. Raj, 5 Sep: nobody is shown this home and no collection action is taken until Zo has confirmed which is true.'
    ),
    (
        '4',
        'Shellbie Bustos',
        false,
        null,
        null,
        true,
        null
    ),
    ('6', 'Haylee Pate', false, null, null, true, null),
    (
        '13',
        'Shyanne Christian',
        false,
        null,
        null,
        true,
        'Site plan marks this home as moving out. Confirm the notice is real before acting on it.'
    ),
    (
        '14',
        'Jasmine Grant',
        false,
        null,
        'daughter',
        true,
        'Listed as a daughter. Confirm whether she is the leaseholder or an occupant before any notice is issued in her name.'
    ),
    ('15', 'A J', false, null, 'manager', true, null),
    (
        '16',
        'Chris Morris',
        false,
        'lot_only',
        null,
        true,
        'Resident-owned home on lot rent, per the site plan. Recovery is of the lot, never the home.'
    ),
    (
        '17',
        'Michael Carter',
        false,
        null,
        null,
        true,
        null
    ),
    (
        '23',
        'Chloe Bennett',
        false,
        null,
        'daughter',
        true,
        'Listed as a daughter. Confirm whether she is the leaseholder or an occupant before any notice is issued in her name.'
    ),
    (
        '27',
        'Laterrick Walker',
        true,
        null,
        null,
        true,
        'Housing assistance. Contract rent and resident portion are not yet recorded - both are needed before any notice, which must demand the resident portion and not the gross rent.'
    ),
    (
        '28',
        'Cody Butler',
        false,
        null,
        null,
        true,
        null
    ),
    (
        '31',
        'Crystal Hill',
        true,
        null,
        null,
        true,
        'Housing assistance. Contract rent and resident portion are not yet recorded - both are needed before any notice, which must demand the resident portion and not the gross rent.'
    ),
    (
        '41',
        'Rosaland Parker',
        false,
        null,
        null,
        true,
        null
    ),
    (
        '43',
        'Ieiasha Grant',
        false,
        null,
        'daughter',
        true,
        'Listed as a daughter. Confirm whether she is the leaseholder or an occupant before any notice is issued in her name.'
    ),
    (
        '44',
        'Christina Franks',
        false,
        null,
        null,
        true,
        null
    ),
    (
        '46',
        'Antonio Palma',
        false,
        null,
        null,
        true,
        null
    ),
    (
        '106 Fox Run Rd',
        'Karen Grant',
        false,
        null,
        'manager',
        true,
        'Not a lot in the community. Included because she is on the supplied list. Confirm whether rent is collected here at all before Zo is asked to call on it.'
    ) on conflict (property, lot_number) do nothing;