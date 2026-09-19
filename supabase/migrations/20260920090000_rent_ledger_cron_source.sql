-- 20260920090000_rent_ledger_cron_source.sql
-- The nightly rent job stamps its charges with source 'cron', but the check
-- constraint only allowed 'qbo_sync' and 'manual', so every insert it made was
-- rejected. The job ran daily from 12 Sep and charged nothing.
--
-- 'cron' is added rather than the job being changed to say 'manual', because
-- the ledger should record where a charge actually came from. When QuickBooks
-- arrives, telling a machine-raised charge from a hand-entered one is the
-- difference between reconciling and guessing.

alter table rent_ledger
    drop constraint if exists rent_ledger_source_check;

alter table rent_ledger
    add constraint rent_ledger_source_check
    check (source = any (array['qbo_sync'::text, 'manual'::text, 'cron'::text]));