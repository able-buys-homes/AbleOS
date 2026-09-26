-- What QuickBooks called this fee. Null until it has been posted, which is
-- also how the sync knows what is left to do.
alter table applicants
  add column if not exists qbo_txn_id text;
