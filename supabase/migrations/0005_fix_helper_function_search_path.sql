-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Fixes the "Function Search Path Mutable" security lint for the
-- role/scope helper functions introduced in 0004.
alter function app_user_role() set search_path = public;
alter function user_scope_uc_ids() set search_path = public;
alter function can_manage() set search_path = public;
alter function can_enter_data() set search_path = public;
