-- Mark the seeded collections rows as sample data.
--
-- /zo/collections went live seeded from the collections mock. The names on it
-- - Priscilla Munn, Curtis Amaya, Denise Whitlow and five others - are
-- invented, and none appear in the seventeen named residents. Production has
-- been showing people who do not exist owing amounts that look real.
--
-- Raj, 5 Sep: the real roll gets built unit by unit from the lease and Zo's
-- physical confirmation. Until then every seeded row says so, on the screen
-- and in anything exported from it.
alter table public.lots
add column if not exists is_sample boolean not null default false;

-- Everything in the table today arrived from the seed migration, so this is
-- exact rather than a guess at which rows are fake. Rows added from here -
-- real units, from real leases - default to false and need no maintenance.
update public.lots
set
    is_sample = true;

comment on column public.lots.is_sample is
    'True for rows seeded from the collections mock. Real units built from a lease and Zo''s walk are false. The UI must label true rows visibly.';