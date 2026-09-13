-- Ellery's applicant pipeline, across both books of business.
--
-- The stage a person is at is NOT stored. It is read from the facts: a fee
-- date means the fee is paid, an order date means screening is out, a decision
-- means it is decided. A stored stage and the dates behind it would disagree
-- the first time somebody corrected one without the other, and the card would
-- then be telling Ellery something the record does not support.
--
-- HTM applicants link to the residency form they filled in, so the PDF is one
-- tap away and nothing is retyped. AHTX applicants never fill that form, which
-- is why that column is nullable and the pipeline lives in its own table.

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),

  -- Which book of business. Different paperwork, different owner, and the
  -- card says which at a glance.
  portfolio text not null check (portfolio in ('ahtx', 'htm')),

  name text not null,
  -- As it reads on the card: "1920 27th St - Unit A", "Lot 2".
  property_label text,

  -- Set for Hometown Meadows, where the lot is a real record.
  lot_id uuid references public.lots (id) on delete set null,
  application_id uuid
    references public.htm_applications (id) on delete set null,

  -- How it reached us: "Email to apply@ablehousingtexas.com", "Zo's iPad".
  came_in_by text,
  arrived_at timestamptz not null default now(),

  /* ---- the fee ---- */
  fee_amount numeric(10, 2),
  fee_paid_on date,

  /* ---- screening ---- */
  screening_ordered_on date,
  screening_result text,

  /* ---- the decision ---- */
  -- Null until Ellery decides. "conditions" is its own answer rather than a
  -- footnote on approved, because the conditions are what the lease has to say.
  decision text check (decision in ('approved', 'conditions', 'denied')),
  decision_on date,
  decision_note text,
  notified_on date,

  who_else_knows text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Oldest first is the default order on the screen, per portfolio.
create index if not exists applicants_portfolio_arrived_idx
  on public.applicants (portfolio, arrived_at);

create index if not exists applicants_lot_idx on public.applicants (lot_id);

/* ---- who can see it ---- */
-- Ellery owns this. Raj and Dane can read and act because they cover for her;
-- nobody else has any business reading a stranger's screening result.
alter table public.applicants enable row level security;

create policy "read applicants"
  on public.applicants for select to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "open applicants"
  on public.applicants for insert to authenticated
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

create policy "work on applicants"
  on public.applicants for update to authenticated
  using (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  )
  with check (
    (select profiles.cockpit from profiles where profiles.id = auth.uid())
      = any (array['ellery', 'raj', 'dane'])
  );

comment on table public.applicants is
  'Ellery''s applicant pipeline. The stage is derived from the dates, never stored.';