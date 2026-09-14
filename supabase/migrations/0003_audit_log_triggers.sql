-- ============================================================
-- Audit log — database-level, not app-level
-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Every insert/update/delete on the tables below is recorded
-- automatically, so it can't be bypassed by the frontend.
-- ============================================================

create or replace function audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  actor := auth.uid();
  if tg_op = 'INSERT' then
    insert into audit_log(user_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'insert', tg_table_name, new.id, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log(user_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'update', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log(user_id, action, table_name, record_id, old_value, new_value)
    values (actor, 'delete', tg_table_name, old.id, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

-- Not directly callable via the REST API — only Postgres triggers invoke it.
revoke execute on function audit_trigger_fn() from anon, authenticated, public;

do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'staff','teams','team_members','campaigns','schools','school_assignments',
    'mmp_contacts','mmp_assignments','households','missed_children',
    'daily_reports','ddm_cards','supervision_visits'
  ])
  loop
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function audit_trigger_fn()',
      tbl || '_audit', tbl
    );
  end loop;
end $$;
