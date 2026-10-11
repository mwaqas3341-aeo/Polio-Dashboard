// Creates / resets / disables login accounts for Area Incharges and team members.
// Username = 13-digit CNIC (<cnic>@cnic.polio.local), first password = the same CNIC, and the person must change it at first sign-in.
// Only an administrator, or the UCMO of the staff member's own union council, may call it. Runs with the service role,
// so every permission check is done here, on the server, not in the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ROLE_FOR: Record<string, string> = { aic: "aic", team_member: "team_member", ucmo: "ucmo" };   // ucmo logins: administrators only

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);
  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: cp } = await admin.from("profiles").select("role, uc_id").eq("id", user.id).maybeSingle();
  if (!cp || !["admin", "ucmo"].includes(cp.role)) return json({ error: "Only an administrator or a UCMO can manage login accounts" }, 403);

  let body: { action?: string; staff_ids?: string[] };
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const action = body.action ?? "";
  const ids = [...new Set((body.staff_ids ?? []).filter((x) => typeof x === "string"))].slice(0, 200);
  if (!["create", "reset", "disable", "enable"].includes(action) || !ids.length) return json({ error: "action and staff_ids are required" }, 400);

  const results: { staff_id: string; name?: string; ok: boolean; message: string }[] = [];
  for (const id of ids) {
    const fail = (message: string, name?: string) => results.push({ staff_id: id, name, ok: false, message });
    const done = (message: string, name?: string) => results.push({ staff_id: id, name, ok: true, message });
    const { data: s } = await admin.from("staff").select("id, full_name, cnic, phone, designation, status, uc_id").eq("id", id).maybeSingle();
    if (!s) { fail("Staff record not found"); continue; }
    if (cp.role === "ucmo" && (!cp.uc_id || s.uc_id !== cp.uc_id)) { fail("Not in your union council", s.full_name); continue; }
    const role = ROLE_FOR[s.designation];
    if (!role) { fail("Logins are only for UCMOs, Area Incharges and team members", s.full_name); continue; }
    if (role === "ucmo" && cp.role !== "admin") { fail("Only an administrator can manage a UCMO login", s.full_name); continue; }
    const digits = String(s.cnic ?? "").replace(/\D/g, "");
    if (!/^\d{13}$/.test(digits)) { fail("CNIC is missing or is not 13 digits — correct it in Staff Management first", s.full_name); continue; }
    const email = `${digits}@cnic.polio.local`;
    const { data: prof } = await admin.from("profiles").select("id, role").eq("staff_id", id).maybeSingle();

    if (action === "create") {
      if (prof) { fail("Already has a login", s.full_name); continue; }
      if (s.status !== "active") { fail("Staff member is not active", s.full_name); continue; }
      const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password: digits, email_confirm: true });
      if (ce || !created?.user) { fail(/already|registered|exists/i.test(ce?.message ?? "") ? "This CNIC already belongs to another login account" : (ce?.message ?? "Could not create the login"), s.full_name); continue; }
      const { error: pe } = await admin.from("profiles").insert({ id: created.user.id, full_name: s.full_name, phone: s.phone ?? null, role, uc_id: s.uc_id, staff_id: s.id, must_change_password: true });
      if (pe) { await admin.auth.admin.deleteUser(created.user.id); fail("Could not link the login: " + pe.message, s.full_name); continue; }
      done("Login created — username and first password are the CNIC", s.full_name);
      continue;
    }

    if (!prof) { fail("No login exists yet — create it first", s.full_name); continue; }
    if (prof.role !== role) { fail("This account is not a " + role + " login", s.full_name); continue; }
    if (action === "reset") {
      const { error: ue } = await admin.auth.admin.updateUserById(prof.id, { email, email_confirm: true, password: digits });
      if (ue) { fail(ue.message, s.full_name); continue; }
      await admin.from("profiles").update({ must_change_password: true }).eq("id", prof.id);
      done("Password reset to the CNIC; a new password will be required at next sign-in", s.full_name);
    } else {
      const { error: ue } = await admin.auth.admin.updateUserById(prof.id, { ban_duration: action === "disable" ? "876000h" : "none" });
      if (ue) { fail(ue.message, s.full_name); continue; }
      await admin.from("profiles").update({ login_disabled: action === "disable" }).eq("id", prof.id);
      done(action === "disable" ? "Login disabled" : "Login enabled", s.full_name);
    }
  }
  return json({ results });
});
