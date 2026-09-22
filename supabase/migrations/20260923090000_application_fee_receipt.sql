-- 20260923090000_application_fee_receipt.sql
-- Two things the online application fee needs.
--
-- poll_token lets the page that submitted an application ask whether the fee
-- has landed, without that question being answerable by anyone who can guess
-- a reference number. It is handed to that browser once and never shown again.
--
-- fee_receipt_no comes from a sequence rather than a random string or a count
-- of rows. Sequential numbers cannot collide, and a gap in them is something
-- an accountant can see and ask about.

alter table htm_applications
    add column if not exists poll_token text;

create sequence if not exists application_fee_receipt_seq start with 1001;

alter table applicants
    add column if not exists fee_receipt_no text;

alter table applicants
    add column if not exists fee_paid_at timestamptz;

alter table applicants
    add column if not exists fee_stripe_payment_intent text;

comment on column htm_applications.poll_token is
    'Secret held by the submitting browser so it may ask whether the fee is paid. Never returned by any read.';

comment on column applicants.fee_receipt_no is
    'Receipt number from application_fee_receipt_seq. Unique and sequential.';

create unique index if not exists applicants_fee_receipt_no_key
    on applicants (fee_receipt_no)
    where fee_receipt_no is not null;