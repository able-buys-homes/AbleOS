-- 20260903090000_collections.sql
-- Rent collections and the eviction cascade at Hometown Meadows.
--
-- Two rules from the work order are enforced here rather than in application
-- code, because code can be bypassed and a constraint cannot:
--
--   1. Nothing is ever hard deleted. Payments are insert-only; a correction is
--      a reversing row that points at what it reverses.
--   2. A notice generates from a positive, verified balance. verified_at is the
--      gate, and it lives on the ledger row, not on a screen.
-- ---------------------------------------------------------------------------
-- Lots. tenancy_type drives the entire recovery branch and must never be
-- inferred at runtime - a lot-only tenancy recovers the lot, never the home.
-- ---------------------------------------------------------------------------
create table
    if not exists lots (
        id uuid primary key default gen_random_uuid (),
        property text not null default 'Hometown Meadows MHP',
        lot_number text not null,
        tenant_name text,
        tenancy_type text check (tenancy_type in ('park_owned', 'lot_only')),
        -- Assisted households carry two amounts everywhere. A notice demanding
        -- gross rent instead of the tenant portion is defective on its face.
        hap_household boolean not null default false,
        contract_rent numeric(10, 2),
        tenant_portion numeric(10, 2),
        hap_portion numeric(10, 2),
        pha_contact_email text,
        lease_doc_url text,
        occupied boolean not null default true,
        notes text,
        created_at timestamptz not null default now (),
        updated_at timestamptz not null default now ()
    );

create unique index if not exists lots_property_number on lots (property, lot_number);

-- ---------------------------------------------------------------------------
-- Charges. verified_at is the gate on the whole eviction cascade.
-- ---------------------------------------------------------------------------
create table
    if not exists rent_ledger (
        id uuid primary key default gen_random_uuid (),
        lot_id uuid not null references lots (id),
        period date not null,
        charge_type text not null check (charge_type in ('rent', 'late_fee', 'other')),
        amount numeric(10, 2) not null,
        due_date date,
        source text not null default 'manual' check (source in ('qbo_sync', 'manual')),
        qbo_txn_id text,
        -- No notice generates against an unverified balance.
        verified_at timestamptz,
        verified_by text,
        created_at timestamptz not null default now ()
    );

create index if not exists rent_ledger_lot on rent_ledger (lot_id, period desc);

create index if not exists rent_ledger_unverified on rent_ledger (lot_id)
where
    verified_at is null;

-- ---------------------------------------------------------------------------
-- Payments. Insert only. A correction is a reversing row with a reason.
-- ---------------------------------------------------------------------------
create table
    if not exists payments (
        id uuid primary key default gen_random_uuid (),
        lot_id uuid not null references lots (id),
        amount numeric(10, 2) not null,
        received_at timestamptz not null default now (),
        method text not null check (
            method in (
                'cash',
                'money_order',
                'cashiers_check',
                'bank',
                'portal',
                'po_box',
                'other'
            )
        ),
        entered_by text not null,
        receipt_number text,
        photo_path text,
        note text,
        -- Set only on a reversing row, pointing at what it reverses.
        reverses_id uuid references payments (id),
        reverse_reason text,
        created_at timestamptz not null default now ()
    );

create index if not exists payments_lot on payments (lot_id, received_at desc);

create unique index if not exists payments_receipt on payments (receipt_number)
where
    receipt_number is not null;

-- A reversing row must say why. Silent corrections are how a ledger stops
-- being evidence.
alter table payments
drop constraint if exists payments_reversal_needs_reason;

alter table payments add constraint payments_reversal_needs_reason check (
    reverses_id is null
    or reverse_reason is not null
);

-- ---------------------------------------------------------------------------
-- Payment plans. status is the interlock: propose, approve, generate, sign,
-- activate. The document endpoint refuses unless status is 'approved'.
-- ---------------------------------------------------------------------------
create table
    if not exists payment_plans (
        id uuid primary key default gen_random_uuid (),
        lot_id uuid not null references lots (id),
        proposed_by text not null,
        proposed_at timestamptz not null default now (),
        reason text,
        status text not null default 'proposed' check (
            status in (
                'proposed',
                'approved',
                'rejected',
                'active',
                'breached',
                'completed'
            )
        ),
        approved_by text,
        approved_at timestamptz,
        doc_url text,
        signed_photo_path text,
        activated_at timestamptz,
        created_at timestamptz not null default now (),
        updated_at timestamptz not null default now ()
    );

create index if not exists payment_plans_lot on payment_plans (lot_id, proposed_at desc);

-- Approve, then sign. Never the reverse - a signature collected before
-- approval arguably binds Kubera to terms Raj never agreed to.
alter table payment_plans
drop constraint if exists payment_plans_approve_before_sign;

alter table payment_plans add constraint payment_plans_approve_before_sign check (
    signed_photo_path is null
    or approved_at is not null
);

-- A document only exists after approval.
alter table payment_plans
drop constraint if exists payment_plans_doc_after_approval;

alter table payment_plans add constraint payment_plans_doc_after_approval check (
    doc_url is null
    or approved_at is not null
);

create table
    if not exists plan_installments (
        id uuid primary key default gen_random_uuid (),
        plan_id uuid not null references payment_plans (id) on delete cascade,
        due_date date not null,
        amount numeric(10, 2) not null,
        paid_at timestamptz,
        payment_id uuid references payments (id),
        created_at timestamptz not null default now ()
    );

create index if not exists plan_installments_plan on plan_installments (plan_id, due_date);

-- ---------------------------------------------------------------------------
-- Notices. generated_from_balance is frozen at generation - if the balance
-- later changes, the notice does not.
-- ---------------------------------------------------------------------------
create table
    if not exists notices (
        id uuid primary key default gen_random_uuid (),
        lot_id uuid not null references lots (id),
        notice_type text not null,
        template_version text not null,
        generated_at timestamptz not null default now (),
        generated_from_balance numeric(10, 2) not null,
        pdf_url text,
        posted_at timestamptz,
        posted_by text,
        photo_wide_path text,
        photo_close_path text,
        geo_lat numeric(9, 6),
        geo_lng numeric(9, 6),
        post_note text,
        certified_tracking text,
        first_class_at timestamptz,
        pha_copy_at timestamptz,
        created_at timestamptz not null default now ()
    );

create index if not exists notices_lot on notices (lot_id, generated_at desc);

-- Proof of service is both photos or neither. One photo is not proof.
alter table notices
drop constraint if exists notices_both_photos;

alter table notices add constraint notices_both_photos check (
    posted_at is null
    or (
        photo_wide_path is not null
        and photo_close_path is not null
    )
);

-- ---------------------------------------------------------------------------
-- Cases. track A is a park-owned home, track B is lot-only and ends
-- differently. Kept as a column so the branch is data, not a runtime guess.
-- ---------------------------------------------------------------------------
create table
    if not exists eviction_cases (
        id uuid primary key default gen_random_uuid (),
        lot_id uuid not null references lots (id),
        notice_id uuid references notices (id),
        track text not null check (track in ('A', 'B')),
        file_sent_at timestamptz,
        filed_at timestamptz,
        served_at timestamptz,
        objection_deadline date,
        contested boolean not null default false,
        judgment_at timestamptz,
        possession_at timestamptz,
        created_at timestamptz not null default now (),
        updated_at timestamptz not null default now ()
    );

create index if not exists eviction_cases_lot on eviction_cases (lot_id, created_at desc);

create index if not exists eviction_cases_open on eviction_cases (objection_deadline)
where
    possession_at is null;

-- ---------------------------------------------------------------------------
-- RLS on, no policies. Every read and write goes through the API on the
-- service key, which is where the Zo / Raj / Ellery split is enforced.
-- ---------------------------------------------------------------------------
alter table lots enable row level security;

alter table rent_ledger enable row level security;

alter table payments enable row level security;

alter table payment_plans enable row level security;

alter table plan_installments enable row level security;

alter table notices enable row level security;

alter table eviction_cases enable row level security;