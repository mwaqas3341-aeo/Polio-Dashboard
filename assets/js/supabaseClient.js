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
