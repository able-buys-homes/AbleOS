-- 20260903094000_receipt_sequence.sql
-- Receipt numbers from a sequence, not a row count.
--
-- The count approach could hand two payments saved in the same second the
-- same number, and it produced HTM-2026-0002 while a seeded row already held
-- HTM-2026-0401. A duplicate receipt number is the kind of thing that reads as
-- tampering long after the fact, so this is a correctness fix, not tidiness.
--
-- Starts at 500 so it can never collide with anything already issued. The
-- counter does not reset each year - uniqueness matters more than a tidy
-- number, and the year in the prefix is for humans reading it, not for the key.

create sequence if not exists receipt_number_seq start with 500;

create or replace function next_receipt_number()
returns text
language sql
volatile
as $$
    select 'HTM-'
        || to_char(now(), 'YYYY')
        || '-'
        || lpad(nextval('receipt_number_seq')::text, 4, '0');
$$;