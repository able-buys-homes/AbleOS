-- 20261015120000_returned_payments.sql
-- T-25 Part 3 (15 Oct 2026): returned payments without reversal rows.
-- Two new charge types, and a link from each to the payment that came back.
-- One of each charge per payment - the unique index makes a double entry
-- impossible. Additive only: no existing row is changed.
begin;
alter table rent_ledger drop constraint rent_ledger_charge_type_check;
alter table rent_ledger add constraint rent_ledger_charge_type_check
  check (charge_type = any (array['rent','late_fee','other','prior_balance','returned_payment','returned_payment_fee']));
alter table rent_ledger add column if not exists returned_payment_id uuid references payments(id);
create unique index if not exists rent_ledger_one_return_per_payment
  on rent_ledger (returned_payment_id, charge_type) where returned_payment_id is not null;
commit;
