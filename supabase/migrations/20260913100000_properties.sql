-- Everything Able Housing Texas owns, and every door inside it.
--
-- Lease and rent hang off the unit, not the property. A duplex has two of
-- each, and a single-family home is a property with one unit - one shape
-- rather than two, and no column that means something different depending on
-- how many doors the building has.
--
-- The status pill on the card is NOT stored. "Missing lease" is what it means
-- for a unit to be occupied with nothing signed; storing that as well would
-- give us two versions of the same fact, and the stored one would be the one
-- that went stale.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),

  portfolio text not null default 'ahtx'
    check (portfolio in ('ahtx', 'htm')),

  -- As it reads on the card: "1920 27th St - Duplex".
  name text not null,
  address text,
  city text,
  state text,
  -- The one-line context: "Fuller portfolio - seller-finance note".
  market_note text,

  -- Whether it is being kept or sold. Drives the FOR SALE pill, and it is a
  -- decision somebody made rather than something derivable.
  sale_status text not null default 'hold'
    check (sale_status in ('hold', 'for_sale', 'sold')),

  appraisal_on_file boolean not null default false,
  appraisal_note text,
  payoff_note text,

  -- Who owns getting this one straight.
  owner_name text,
  drive_url text,

  -- The Fuller homes came across with details nobody has checked against the
  -- Shared Drive yet. Until this is true the card says so rather than
  -- presenting unconfirmed figures as fact.
  details_confirmed boolean not null default false,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references public.properties (id) on delete cascade,

  -- "Unit A", or "Whole home" on a single-family.
  label text not null,

  occupied boolean not null default false,
  tenant_name text,

  lease_state text not null default 'none'
    check (lease_state in ('none', 'draft', 'out_for_signature', 'signed')),
  lease_version text,
  lease_url text,

  move_in_on date,
  rent_amount numeric(10, 2),
  -- Where a figure is not one number: "$2,800 + $200 pool".
  rent_note text,
  rent_starts_on date,

  -- Who is being screened for this door, when somebody is.
  applicant_id uuid references public.applicants (id) on delete set null,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_units_property_idx
  on public.property_units (property_id);

create index if not exists properties_portfolio_idx
  on public.properties (portfolio, name);

/* ---- who can see it ---- */
alter table public.properties enable row level security;
alter table public.property_units enable row level security;

create policy "read properties"
  on public.properties for select to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "open properties"
  on public.properties for insert to authenticated
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "work on properties"
  on public.properties for update to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  )
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "read property units"
  on public.property_units for select to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "open property units"
  on public.property_units for insert to authenticated
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "work on property units"
  on public.property_units for update to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  )
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

-- A unit typed in error has to be removable; a property does not get deleted,
-- it gets marked sold.
create policy "remove property units"
  on public.property_units for delete to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

comment on table public.property_units is
  'One door. Lease and rent live here, not on the property - a duplex has two of each.';