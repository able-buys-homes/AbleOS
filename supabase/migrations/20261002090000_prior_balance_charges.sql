-- Past-due balances carried over from QuickBooks. Entered by Zo, one per lot.
-- They already exist in QuickBooks, so they must never be synced back to it.
alter table public.rent_ledger drop constraint rent_ledger_charge_type_check;
alter table public.rent_ledger add constraint rent_ledger_charge_type_check
  check (charge_type = any (array['rent', 'late_fee', 'other', 'prior_balance']));

alter table public.rent_ledger drop constraint rent_ledger_source_check;
alter table public.rent_ledger add constraint rent_ledger_source_check
  check (source = any (array['qbo_sync', 'manual', 'cron', 'qbo_import']));

alter table public.rent_ledger add column if not exists note text;