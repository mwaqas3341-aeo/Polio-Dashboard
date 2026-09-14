// Shared Supabase client, loaded after config.js and the supabase-js CDN script.
const supabaseClient = supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

/** Redirect to login if there's no active session, or to profile setup if
 *  the session has no matching profiles row yet (required before any
 *  UC-scoped table will return rows under the current RLS policies). */
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "/index.html";
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
  await supabaseClient.auth.signOut();
  window.location.href = "/index.html";
}

/** Fills in the shared top bar with the signed-in user's name/role once profiles is available. */
async function loadCurrentProfile() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }
  return data;
}
