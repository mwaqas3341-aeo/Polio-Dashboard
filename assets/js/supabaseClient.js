// Shared Supabase client, loaded after config.js and the supabase-js CDN script.
const supabaseClient = supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

/** Folder that holds index.html (the login page), also when the site is served from a sub-path such as /Polio-Dashboard/ on GitHub Pages. */
function appRoot() {
  const path = window.location.pathname, i = path.indexOf("/pages/");
  return i >= 0 ? path.slice(0, i + 1) : path.slice(0, path.lastIndexOf("/") + 1);
}
const loginUrl = () => appRoot() + "index.html";

/** Redirect to login if there's no active session, or to profile setup if
 *  the session has no matching profiles row yet (required before any
 *  UC-scoped table will return rows under the current RLS policies). */
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.replace(loginUrl());
    return null;
  }
  const page = window.location.pathname.split("/").pop();
  if (page !== "setup-profile.html") {
    const profile = await loadCurrentProfile();
    if (!profile) {
      const inPages = window.location.pathname.includes("/pages/");
      window.location.href = inPages ? "../setup-profile.html" : "setup-profile.html";
      return null;
    }
  }
  return session;
}

async function signOut() {
  try { await supabaseClient.auth.signOut(); } catch (e) { console.error("Sign out failed", e); }
  try { Object.keys(localStorage).filter(k => k.startsWith("sb-")).forEach(k => localStorage.removeItem(k)); } catch (e) {}   // make sure no session is left behind
  window.location.replace(loginUrl());                                                                                       // the login page, whichever folder the user is in
}

// Signed out in another tab, or the session expired: go to the login page (not on the login page itself).
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && !/\/index\.html$|\/$/.test(window.location.pathname)) window.location.replace(loginUrl());
});

/** Fills in the shared top bar with the signed-in user's name/role once profiles is available. */
async function loadCurrentProfile() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("full_name, role, must_change_password")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }
  return data;
}

/** Calculation formulas of a union council (set on the Calculation formulas page); defaults apply until they are saved. */
const FORMULA_DEFAULTS = { doses_per_child: 1.11, blue_per_child: 1, blue_base: "under_1", red_per_child: 1, red_base: "age_1_5" };
async function loadFormula(ucId) {
  if (!ucId) return { ...FORMULA_DEFAULTS };
  const { data } = await supabaseClient.from("calc_formulas").select("doses_per_child, blue_per_child, blue_base, red_per_child, red_base").eq("uc_id", ucId).maybeSingle();
  return data ? { doses_per_child: Number(data.doses_per_child), blue_per_child: Number(data.blue_per_child), blue_base: data.blue_base, red_per_child: Number(data.red_per_child), red_base: data.red_base } : { ...FORMULA_DEFAULTS };
}
/** Same arithmetic the database uses for an Operational Plan: doses and Blue / Red capsules from the formulas. */
function calcFromFormula(f, c) {
  const u1 = Math.max(0, +c.u1 || 0), hh = Math.max(0, +c.hh || 0), school = Math.max(0, +c.school || 0), mmp = Math.max(0, +c.mmp || 0), total = u1 + hh + school + mmp;
  const base = (b) => b === "under_1" ? u1 : b === "age_1_5" ? hh + school + mmp : total, up = (v) => Math.ceil(Math.round(v * 1e6) / 1e6);
  return { total, doses: Math.round(total * f.doses_per_child * 100) / 100, blue: up(base(f.blue_base) * f.blue_per_child), red: up(base(f.red_base) * f.red_per_child) };
}
