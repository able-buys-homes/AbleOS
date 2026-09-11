-- Eighteen lots are occupied with no rent ever recorded. They are about to be
-- given $1 so the roll stops refusing payments against them, and $1 is not a
-- rent - it is a stand-in until somebody asks the resident what they actually
-- pay.
--
-- Without this flag that $1 is indistinguishable from a real figure, and a
-- balance built on it looks settled when it is meaningless. Cleared the moment
-- a real amount is entered over the top.
alter table public.lots
add column if not exists rent_placeholder boolean not null default false;

comment on column public.lots.rent_placeholder is 'True when contract_rent is a stand-in nobody has confirmed with the resident. The roll must not present a balance built on it as trustworthy.';