-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Private bucket for CNIC front/back photos. Object paths are
-- {uc_id}/{staff_id}/front.<ext> or back.<ext>, so the same UC scoping
-- used everywhere else in the schema applies here via the folder name.
insert into storage.buckets (id, name, public)
values ('staff-documents', 'staff-documents', false)
on conflict (id) do nothing;

create policy staff_docs_select on storage.objects for select using (
  bucket_id = 'staff-documents'
  and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids())
);
create policy staff_docs_insert on storage.objects for insert with check (
  bucket_id = 'staff-documents'
  and can_enter_data()
  and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids())
);
create policy staff_docs_update on storage.objects for update using (
  bucket_id = 'staff-documents'
  and can_manage()
  and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids())
);
create policy staff_docs_delete on storage.objects for delete using (
  bucket_id = 'staff-documents'
  and can_manage()
  and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids())
);
