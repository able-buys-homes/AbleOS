-- v1 cockpits (8 Oct 2026): AHTX door rules by portfolio, offboarding switch, test-applicant flag.
drop policy if exists "read property units" on public.property_units;
drop policy if exists "work on property units" on public.property_units;
drop policy if exists "open property units" on public.property_units;
drop policy if exists "remove property units" on public.property_units;
create policy "read property units" on public.property_units for select to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and property_id in (select id from public.properties where portfolio in (select public.auth_portfolios())));
create policy "work on property units" on public.property_units for update to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and property_id in (select id from public.properties where portfolio in (select public.auth_portfolios())))
  with check ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and property_id in (select id from public.properties where portfolio in (select public.auth_portfolios())));
create policy "open property units" on public.property_units for insert to authenticated
  with check ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and property_id in (select id from public.properties where portfolio in (select public.auth_portfolios())));
create policy "remove property units" on public.property_units for delete to authenticated
  using ((select cockpit from public.profiles where id = auth.uid()) = any (array['ellery','raj','dane'])
         and property_id in (select id from public.properties where portfolio in (select public.auth_portfolios())));

create or replace function public.offboard_person(p_cockpit text, p_by text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare pid uuid; n_grants int; n_sessions int;
begin
  if p_cockpit = 'raj' then raise exception 'Refusing to offboard Raj'; end if;
  if coalesce(trim(p_by), '') = '' or coalesce(trim(p_reason), '') = '' then raise exception 'Say who is doing this and why'; end if;
  select id into pid from public.profiles where cockpit = p_cockpit;
  if pid is null then raise exception 'No profile for cockpit %', p_cockpit; end if;
  update auth.users set banned_until = 'infinity' where id = pid;
  delete from auth.sessions where user_id = pid; get diagnostics n_sessions = row_count;
  delete from public.profile_portfolios where profile_id = pid; get diagnostics n_grants = row_count;
  insert into public.audit_log (actor, action, target, detail)
  values (p_by, 'offboard', p_cockpit, jsonb_build_object('reason', p_reason, 'sign_in_banned', true, 'sessions_ended', n_sessions, 'portfolio_grants_removed', n_grants));
  return jsonb_build_object(
    'done', jsonb_build_array('Sign-in banned', n_sessions || ' session(s) ended', n_grants || ' portfolio grant(s) removed', 'Audit entry written'),
    'still_to_do_by_hand', jsonb_build_array('Vercel: delete MCP_TOKEN_' || upper(p_cockpit) || ' (if set) and redeploy', 'Rotate any lockbox, door or gate codes they were shown', 'Remove Google Drive and Workspace access', 'Remove QuickBooks / Rightworks and any bank-feed access', 'Remove Dialpad and n8n access', 'Get Raj''s sign-off and note it in project_log'));
end $$;
revoke all on function public.offboard_person(text, text, text) from public, anon, authenticated;

alter table public.applicants add column if not exists is_test boolean not null default false;
