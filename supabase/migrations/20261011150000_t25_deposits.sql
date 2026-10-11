-- T-25 deposits (11 Oct 2026). Already run by hand in the SQL editor.
-- Server-only tables; not synced to QuickBooks until Sofi decides.
create table public.deposits (
    id uuid primary key default gen_random_uuid(),
    portfolio text not null check (portfolio in ('htm', 'ahtx')),
    lot_id uuid references public.lots(id),
    unit_id uuid references public.property_units(id),
    tenancy_started_at timestamptz,
    amount numeric(10,2) not null check (amount > 0),
    received_on date not null,
    method text,
    jurisdiction_rule text not null check (jurisdiction_rule in ('AR_18-16', 'TX_92', 'TX_94')),
    monthly_rent_at_receipt numeric(10,2),
    cap_override_by text,
    cap_override_note text,
    surrender_on date,
    forwarding_address_received boolean not null default false,
    forwarding_address_on date,
    status text not null default 'held'
        check (status in ('held', 'due', 'refunded', 'applied', 'partly_refunded', 'returned_mail')),
    refund_amount numeric(10,2),
    itemized_notice_sent_on date,
    closed_on date,
    source text not null default 'manual' check (source in ('manual', 'csv_import')),
    import_ref text,
    note text,
    created_by text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((lot_id is not null) <> (unit_id is not null)),
    check (portfolio <> 'htm' or lot_id is not null),
    check (portfolio <> 'ahtx' or unit_id is not null)
);
create index deposits_open on public.deposits (status, surrender_on) where closed_on is null;

create table public.deposit_deductions (
    id uuid primary key default gen_random_uuid(),
    deposit_id uuid not null references public.deposits(id),
    description text not null,
    amount numeric(10,2) not null check (amount > 0),
    kind text not null check (kind in ('damage', 'unpaid_rent', 'cleaning', 'other')),
    created_by text not null,
    created_at timestamptz not null default now()
);

create table public.deposit_mail_log (
    id uuid primary key default gen_random_uuid(),
    deposit_id uuid not null references public.deposits(id),
    sent_on date not null,
    to_address text not null,
    method text not null check (method in ('first_class', 'certified', 'hand')),
    tracking text,
    returned_undeliverable_on date,
    created_by text not null,
    created_at timestamptz not null default now()
);

create table public.deposit_settings (
    portfolio text primary key check (portfolio in ('htm', 'ahtx')),
    recorders text[] not null,
    alert_recipients text[] not null,
    note text,
    updated_at timestamptz not null default now()
);
insert into public.deposit_settings (portfolio, recorders, alert_recipients, note) values
  ('htm',  array['zo'],     array['raj', 'zo'],     'Coco default 11 Oct 2026; Raj can override'),
  ('ahtx', array['ellery'], array['raj', 'ellery'], 'Coco default 11 Oct 2026; backup recorder Fran (AHTX Rent & Ledger, no cockpit yet)');

alter table public.deposits enable row level security;
alter table public.deposit_deductions enable row level security;
alter table public.deposit_mail_log enable row level security;
alter table public.deposit_settings enable row level security;
revoke all on public.deposits, public.deposit_deductions, public.deposit_mail_log, public.deposit_settings from anon, authenticated;
