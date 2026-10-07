-- v1 cockpits foundation (Raj, 8 Oct 2026): portfolio access, append-only audit log,
-- AHTX door details, Rex's vacant-homes view. Existing people keep the same access.

create table if not exists public.profile_portfolios (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  portfolio text not null check (portfolio in ('htm', 'ahtx')),
  granted_by text,
  granted_at timestamptz not null default now(),
  primary key (profile_id, portfolio)
);
alter table public.profile_portfolios enable row level security;
drop policy if exists "read own portfolios" on public.profile_portfolios;
create policy "read own portfolios" on public.profile_portfolios
  for select to authenticated using (profile_id = auth.uid());

create or replace function public.auth_portfolios()
returns setof text language sql stable security definer set search_path = public as $$
  select portfolio from public.profile_portfolios where profile_id = auth.uid()
$$;
revoke all on function public.auth_portfolios() from public, anon;
grant execute on function public.auth_portfolios() to authenticated;

insert into public.profile_portfolios (profile_id, portfolio, granted_by)
select p.id, g.portfolio, 'dodong (v1 setup)'
from public.profiles p
join (values ('raj','htm'),('raj','ahtx'),('dane','htm'),('dane','ahtx'),
             ('ellery','htm'),('ellery','ahtx'),('zo','htm'),('rex','ahtx')) as g(cockpit, portfolio)
  on g.cockpit = p.cockpit
on conflict do nothing;

drop policy if exists "read properties" on public.properties;
drop policy if exists "work on properties" on public.properties;
drop policy if exists "open properties" on public.properties;
create policy "read properties" on public.properties for select to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and portfolio in (select public.auth_portfolios()));
create policy "work on properties" on public.properties for update to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and portfolio in (select public.auth_portfolios()));
create policy "open properties" on public.properties for insert to authenticated
  with check ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
              and portfolio in (select public.auth_portfolios()));

drop policy if exists "read applicants" on public.applicants;
drop policy if exists "work on applicants" on public.applicants;
drop policy if exists "open applicants" on public.applicants;
create policy "read applicants" on public.applicants for select to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and portfolio in (select public.auth_portfolios()));
create policy "work on applicants" on public.applicants for update to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and portfolio in (select public.auth_portfolios()));
create policy "open applicants" on public.applicants for insert to authenticated
  with check ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
              and portfolio in (select public.auth_portfolios()));

create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb
);
alter table public.audit_log enable row level security;
create or replace function public.audit_log_append_only() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

alter table public.property_units
  add column if not exists beds numeric,
  add column if not exists baths numeric,
  add column if not exists sq_ft integer,
  add column if not exists access_note text,
  add column if not exists details_confirmed boolean not null default false;
comment on column public.property_units.access_note is
  'How to get in - who to call, where the key box is. Never a lockbox, gate or door code.';

create or replace view public.rex_units_v with (security_invoker = true) as
  select u.id, pr.name as property, pr.address, pr.city, pr.state, u.label,
         u.beds, u.baths, u.sq_ft, u.rent_amount, u.access_note, u.details_confirmed, u.notes
  from public.property_units u
  join public.properties pr on pr.id = u.property_id
  where pr.portfolio = 'ahtx' and coalesce(u.occupied, false) = false;
revoke all on public.rex_units_v from anon, authenticated;
