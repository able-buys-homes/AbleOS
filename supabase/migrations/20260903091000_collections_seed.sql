-- 20260903091000_collections_seed.sql
-- Demo data matching zo-collections-mock.html, so Raj can sign off against
-- the same screen he approved.
--
-- Only the lots the mock names are seeded. The real rent roll is rebuilt from
-- leases and Zo's physical confirmation, per the collections spec - inventing
-- the other ten lots to make a tile read 18 would make bad data authoritative
-- on day one, which is the exact thing that spec warns against.
--
-- Every name here is fictional. Safe to delete this file and its rows once the
-- real roll is loaded.
insert into
    lots (
        lot_number,
        tenant_name,
        tenancy_type,
        hap_household,
        contract_rent,
        tenant_portion,
        hap_portion,
        occupied
    )
values
    (
        '8',
        'Denise Whitlow',
        'park_owned',
        false,
        550,
        null,
        null,
        true
    ),
    (
        '14',
        'Priscilla Munn',
        'park_owned',
        true,
        610,
        110,
        500,
        true
    ),
    (
        '5',
        'Tanya Reeves',
        'park_owned',
        true,
        650,
        95,
        555,
        true
    ),
    (
        '21',
        'Curtis Amaya',
        'lot_only',
        false,
        410,
        null,
        null,
        true
    ),
    (
        '16',
        'Everett Doss',
        'lot_only',
        false,
        1250,
        null,
        null,
        true
    ),
    (
        '11',
        'Roy Castellan',
        'park_owned',
        false,
        550,
        null,
        null,
        true
    ),
    (
        '3',
        'Marcus Ellison',
        'park_owned',
        false,
        550,
        null,
        null,
        true
    ),
    ('12', null, null, false, null, null, null, false) on conflict (property, lot_number) do nothing;

-- Charges. Only Lot 8 is verified - the mock shows Raj cleared it this
-- morning, and everything else is deliberately still unverified so no notice
-- could generate against it.
insert into
    rent_ledger (
        lot_id,
        period,
        charge_type,
        amount,
        due_date,
        source,
        verified_at,
        verified_by
    )
select
    l.id,
    date '2026-09-01',
    v.charge_type,
    v.amount,
    date '2026-09-01',
    'manual',
    v.verified_at,
    v.verified_by
from
    (
        values
            (
                '8',
                'rent',
                550.00,
                timestamptz '2026-09-02 13:00:00+00',
                'raj'
            ),
            (
                '8',
                'late_fee',
                75.00,
                timestamptz '2026-09-02 13:00:00+00',
                'raj'
            ),
            ('14', 'rent', 110.00, null, null),
            ('5', 'rent', 95.00, null, null),
            ('21', 'rent', 410.00, null, null),
            ('16', 'rent', 1250.00, null, null),
            ('3', 'rent', 550.00, null, null)
    ) as v (
        lot_number,
        charge_type,
        amount,
        verified_at,
        verified_by
    )
    join lots l on l.lot_number = v.lot_number
    and l.property = 'Hometown Meadows MHP';

-- Lot 3 paid by bank deposit on Sep 1. Not entered by Zo - bank, portal and
-- PO Box post on their own; his screen is exception handling only.
insert into
    payments (
        lot_id,
        amount,
        received_at,
        method,
        entered_by,
        receipt_number
    )
select
    l.id,
    550.00,
    timestamptz '2026-09-01 15:00:00+00',
    'bank',
    'qbo_sync',
    'HTM-2026-0401'
from
    lots l
where
    l.lot_number = '3'
    and l.property = 'Hometown Meadows MHP';

-- Lot 11: approved, signed and active. Lot 5: proposed, waiting on Raj -
-- no doc_url and no signature, which the constraints would refuse anyway.
insert into
    payment_plans (
        lot_id,
        proposed_by,
        proposed_at,
        reason,
        status,
        approved_by,
        approved_at,
        doc_url,
        signed_photo_path,
        activated_at
    )
select
    l.id,
    'zo',
    timestamptz '2026-08-14 15:00:00+00',
    'Behind after a slow month',
    'active',
    'raj',
    timestamptz '2026-08-14 17:00:00+00',
    'https://example.invalid/plan-lot-11.pdf',
    'htm/lot-11/signed-plan.jpg',
    timestamptz '2026-08-15 16:00:00+00'
from
    lots l
where
    l.lot_number = '11'
    and l.property = 'Hometown Meadows MHP';

insert into
    payment_plans (lot_id, proposed_by, proposed_at, reason, status)
select
    l.id,
    'zo',
    timestamptz '2026-09-03 15:42:00+00',
    'Hours cut at work',
    'proposed'
from
    lots l
where
    l.lot_number = '5'
    and l.property = 'Hometown Meadows MHP';

insert into
    plan_installments (plan_id, due_date, amount, paid_at)
select
    p.id,
    v.due_date,
    170.00,
    v.paid_at
from
    payment_plans p
    join lots l on l.id = p.lot_id
    cross join (
        values
            (
                date '2026-08-15',
                timestamptz '2026-08-15 16:00:00+00'
            ),
            (
                date '2026-09-01',
                timestamptz '2026-09-01 16:00:00+00'
            ),
            (date '2026-09-15', null),
            (date '2026-10-01', null),
            (date '2026-10-15', null)
    ) as v (due_date, paid_at)
where
    l.lot_number = '11'
    and p.status = 'active';

-- Lot 14's notice is posted with both photos. Lot 8's is generated and
-- waiting to be printed - no posted_at, so no photos required yet.
insert into
    notices (
        lot_id,
        notice_type,
        template_version,
        generated_at,
        generated_from_balance,
        posted_at,
        posted_by,
        photo_wide_path,
        photo_close_path,
        geo_lat,
        geo_lng,
        certified_tracking,
        first_class_at,
        pha_copy_at
    )
select
    l.id,
    'three_day_notice_to_vacate',
    'AR-v1',
    timestamptz '2026-08-27 13:00:00+00',
    110.00,
    timestamptz '2026-08-27 13:14:00+00',
    'zo',
    'htm/lot-14/wide.jpg',
    'htm/lot-14/close.jpg',
    33.9451,
    -93.8471,
    '7020 1810 0001 4423 9087',
    timestamptz '2026-08-27 13:00:00+00',
    timestamptz '2026-08-27 13:00:00+00'
from
    lots l
where
    l.lot_number = '14'
    and l.property = 'Hometown Meadows MHP';

insert into
    notices (
        lot_id,
        notice_type,
        template_version,
        generated_at,
        generated_from_balance
    )
select
    l.id,
    'three_day_notice_to_vacate',
    'AR-v1',
    timestamptz '2026-09-03 11:02:00+00',
    625.00
from
    lots l
where
    l.lot_number = '8'
    and l.property = 'Hometown Meadows MHP';

-- Lot 16 is with counsel. Track B - lot only, so recovery is the lot and
-- never the home.
insert into
    eviction_cases (
        lot_id,
        notice_id,
        track,
        file_sent_at,
        filed_at,
        served_at,
        objection_deadline
    )
select
    l.id,
    null,
    'B',
    timestamptz '2026-08-26 15:00:00+00',
    timestamptz '2026-08-28 15:00:00+00',
    timestamptz '2026-08-31 15:00:00+00',
    date '2026-09-05'
from
    lots l
where
    l.lot_number = '16'
    and l.property = 'Hometown Meadows MHP';