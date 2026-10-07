-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-07.
-- Edit a team (number, type, Area Incharge) with history for its members; tighten who may save roster snapshots; audit the plan table.
create or replace function update_team(p_team uuid, p_team_no int, p_type text, p_aic uuid, p_campaign uuid default null) returns void
language plpgsql set search_path = public as $$
declare t teams%rowtype; m record;
begin
  select * into t from teams where id = p_team;
  if not found then raise exception 'Team not found'; end if;
  if p_type not in ('fixed','transit','mobile') then raise exception 'Team type must be Fixed, Transit or Mobile'; end if;
  if p_aic is not null and not exists (select 1 from staff where id = p_aic and designation = 'aic' and uc_id = t.uc_id) then
    raise exception 'Choose an Area Incharge of this union council';
  end if;
  if p_aic is distinct from t.aic_staff_id then
    if p_aic is null and exists (select 1 from team_members where team_id = p_team and active) then
      raise exception 'Move or remove the team members before taking the team away from its Area Incharge';
    end if;
    for m in select staff_id from team_members where team_id = p_team and active loop
      update staff set aic_staff_id = p_aic where id = m.staff_id;
      insert into staff_adjustment_history (campaign_id, uc_id, ucmo_staff_id, staff_id, adjustment_type, from_team_id, to_team_id, from_team_no, to_team_no,
          from_team_type, to_team_type, from_aic_id, to_aic_id, reason, details)
      values (p_campaign, t.uc_id, (select id from staff where uc_id = t.uc_id and designation = 'ucmo' and status = 'active' limit 1), m.staff_id, 'transfer',
          p_team, p_team, t.team_no, p_team_no, t.team_type, p_type, t.aic_staff_id, p_aic, 'Team given to another Area Incharge', jsonb_build_object('team_edit', true));
    end loop;
  end if;
  update teams set team_no = p_team_no, team_type = p_type, aic_staff_id = p_aic where id = p_team;
end $$;
revoke all on function update_team(uuid,int,text,uuid,uuid) from public, anon;
grant execute on function update_team(uuid,int,text,uuid,uuid) to authenticated;

create or replace function snapshot_campaign_roster(p_campaign uuid, p_reason text default 'manual') returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; u record;
begin
  if app_user_role() not in ('admin','district_coordinator','ucmo') then raise exception 'Not allowed'; end if;
  for u in select id from union_councils where id in (select user_scope_uc_ids()) loop
    insert into campaign_roster_snapshots (campaign_id, uc_id, reason, planned_aics, planned_teams, data)
    select p_campaign, u.id, p_reason, (select total_aics from uc_plans where uc_id = u.id), (select total_teams from uc_plans where uc_id = u.id),
      jsonb_build_object(
        'ucmo', (select jsonb_build_object('name', s.full_name, 'cnic', s.cnic, 'cell', s.phone) from staff s where s.uc_id = u.id and s.designation = 'ucmo' and s.status = 'active' limit 1),
        'aics', coalesce((select jsonb_agg(jsonb_build_object('aic_no', a.aic_no, 'name', a.full_name, 'cnic', a.cnic, 'cell', a.phone,
            'driver', (select jsonb_build_object('name', d.full_name, 'cnic', d.cnic, 'cell', d.phone) from staff d where d.aic_staff_id = a.id and d.designation = 'driver' and d.status = 'active' limit 1),
            'teams', coalesce((select jsonb_agg(jsonb_build_object('team_no', t.team_no, 'type', t.team_type,
                'members', coalesce((select jsonb_agg(jsonb_build_object('no', tm.member_no, 'name', s2.full_name, 'cnic', s2.cnic, 'cell', s2.phone) order by tm.member_no)
                           from team_members tm join staff s2 on s2.id = tm.staff_id where tm.team_id = t.id and tm.active), '[]'::jsonb)) order by t.team_no)
              from teams t where t.aic_staff_id = a.id), '[]'::jsonb)) order by a.aic_no)
          from staff a where a.uc_id = u.id and a.designation = 'aic' and a.status = 'active'), '[]'::jsonb));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function campaign_closed_snapshot() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' and app_user_role() in ('admin','district_coordinator','ucmo') then
    perform snapshot_campaign_roster(new.id, 'closed');
  end if;
  return new;
end $$;

drop trigger if exists uc_plans_audit on uc_plans;
create trigger uc_plans_audit after insert or update or delete on uc_plans for each row execute function audit_trigger_fn();
