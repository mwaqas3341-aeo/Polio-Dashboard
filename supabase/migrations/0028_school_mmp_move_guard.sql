-- NOT YET APPLIED. Run once in the Supabase SQL editor.
-- Editing a school / MMP assignment can now move it to another team or day. The old guard only looked at the NEW team/day,
-- so a school could be moved OUT of a submitted Operational Plan. This checks the old position as well. Nothing else changes.
create or replace function plan_lists_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; tid uuid; locked boolean; i int;
begin
  for i in 1..2 loop
    if i = 1 then
      if tg_op = 'INSERT' then continue; end if;
      r := old;
    else
      if tg_op = 'DELETE' then continue; end if;
      if tg_op = 'UPDATE' and new.campaign_id = old.campaign_id and new.team_no = old.team_no and new.campaign_day = old.campaign_day then continue; end if;
      r := new;
    end if;
    select t.id into tid from teams t join campaigns c on c.uc_id = t.uc_id where c.id = r.campaign_id and t.team_no = r.team_no limit 1;
    if tid is not null then
      select (status = 'submitted') into locked from operational_plans where campaign_id = r.campaign_id and team_id = tid and campaign_day = r.campaign_day;
      if coalesce(locked, false) and not plan_manager() and auth.uid() is not null then
        raise exception 'The Operational Plan for Team % Day % is already submitted; ask your UCMO to reopen it', r.team_no, r.campaign_day;
      end if;
    end if;
  end loop;
  -- editing the children count / school in place on a submitted plan is covered by i = 1 (old position)
  return case when tg_op = 'DELETE' then old else new end;
end $$;
