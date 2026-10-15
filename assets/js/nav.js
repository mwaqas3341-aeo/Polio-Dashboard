// Shared top bar. Same three groups as the dashboard cards.
const NAV_GROUPS = [
  { key: "campaign", icon: "bi-flag-fill", label: "Campaign Management", links: [
    { href: "pages/campaigns.html", icon: "bi-calendar-event", label: "Campaign Details" },
    { href: "pages/formulas.html", icon: "bi-calculator", label: "Calculation formulas" },
    { href: "pages/daily-reports.html", icon: "bi-clipboard-data", label: "Daily reports (quick entry)" },
    { href: "pages/reporting.html", icon: "bi-clipboard2-pulse", label: "Reporting — active campaign (2A)" },
    { href: "pages/reporting-history.html", icon: "bi-clock-history", label: "Previous reporting (2A history)" },
    { href: "pages/report-2b.html", icon: "bi-file-earmark-bar-graph", label: "2B form (UCMO — automatic)" },
    { href: "pages/audit-log.html", icon: "bi-shield-check", label: "Audit log" },
  ]},
  { key: "staff", icon: "bi-people-fill", label: "Staff Management", links: [
    { href: "pages/staff.html", icon: "bi-person-badge", label: "Staff Management" },
    { href: "pages/accounts.html", icon: "bi-key", label: "Login accounts" },
    { href: "pages/pdf-downloads.html", icon: "bi-file-earmark-pdf", label: "Staff PDF downloads (CNIC lists)" },
  ]},
  { key: "plan", icon: "bi-diagram-3-fill", label: "Plan Management", links: [
    { href: "pages/plan-setup.html", icon: "bi-question-circle", label: "1. Plan questionnaire (answer first)", nogate: true },
    { href: "pages/operational-plan.html", icon: "bi-signpost-split", label: "Operational Plan", gate: true },
    { href: "pages/fixed-transit-plan.html", icon: "bi-geo-alt", label: "Fixed & Transit plan", gate: true },
    { href: "pages/microplan.html", icon: "bi-journal-richtext", label: "Microplan (auto)", gate: true },
    { href: "pages/maps.html", icon: "bi-map", label: "Maps (UC / AIC / day) — print", gate: true },
    { href: "pages/supervision-forms.html", icon: "bi-ui-checks", label: "Supervisory plan, desk review, validation", gate: true },
    { href: "pages/uc-forms.html", icon: "bi-building", label: "UC summary & social mobilization", gate: true },
    { href: "pages/schools.html", icon: "bi-mortarboard", label: "School list", gate: true },
    { href: "pages/mmp.html", icon: "bi-telephone", label: "MMP / CNIC list", gate: true },
    { href: "pages/households.html", icon: "bi-house", label: "House registration", gate: true },
    { href: "pages/missed-children.html", icon: "bi-person-exclamation", label: "Missed children", gate: true },
    { href: "pages/team-targets.html", icon: "bi-bullseye", label: "Team targets (set by AIC)", gate: true },
    { href: "pages/team-plan.html", icon: "bi-table", label: "Register totals (reference)", gate: true },
    { href: "pages/logistics.html", icon: "bi-truck", label: "Logistic plan (from targets)", gate: true },
    { href: "pages/area-summary.html", icon: "bi-bar-chart", label: "Area Incharge summary", gate: true },
    { href: "pages/supervision.html", icon: "bi-eye", label: "Supervision visits", gate: true },
  ]},
];
const PDF_LINK = { href: "pages/download-micro-plan.html", icon: "bi-file-earmark-pdf", label: "Download Micro Plan", gate: true };
const NAV_LINKS = [{ href: "dashboard.html", label: "Dashboard" }].concat(NAV_GROUPS.flatMap(g => g.links), [PDF_LINK]);

function navHref(h) {
  const inPages = window.location.pathname.includes("/pages/");
  return inPages ? (h.startsWith("pages/") ? h.replace("pages/", "") : "../" + h) : h;
}

/* Plan questionnaire gate: Plan Management pages unlock once the capsule question and every team's questions are answered. */
const PS = {
  yn: (v) => v === "yes" || v === "no", num: (v) => v !== undefined && v !== null && v !== "" && Number(v) >= 0,
  teamDone(a) { a = a || {}; return this.yn(a.mmp) && this.yn(a.schools) && a.confirmed === true; },
  capsDone(c) { c = c || {}; return c.vit_a_needed === "no" || c.vit_a_needed === "yes"; },   // quantities are no longer typed: they come from the Calculation formulas
  async gate() {
    if (this._g) return this._g;
    return this._g = (async () => { try {
      const db = (typeof supabaseClient !== "undefined") ? supabaseClient : null; if (!db) return { open: true };
      // Admin, UCMO and district coordinators are never locked out: they review plans AIC by AIC, so one unfinished AIC must not block the rest.
      try { const p = typeof loadCurrentProfile === "function" ? await loadCurrentProfile() : null; if (p && ["admin", "ucmo", "district_coordinator"].includes(p.role)) return { open: true, privileged: true }; } catch (e) {}
      const { data: cs } = await db.from("campaigns").select("id, uc_id").order("start_date", { ascending: false }).limit(1); const c = (cs || [])[0]; if (!c) return { open: true, none: true };
      const [f, t] = await Promise.all([db.from("campaign_forms").select("aic_staff_id, form_type, data").eq("campaign_id", c.id).in("form_type", ["campaign_setup", "plan_setup"]),
        db.from("teams").select("team_no, aic_staff_id").eq("uc_id", c.uc_id).not("aic_staff_id", "is", null)]);
      if (f.error || t.error) return { open: true };
      const forms = f.data || [], teams = t.data || [], caps = (forms.find(x => x.form_type === "campaign_setup") || {}).data;
      const answered = (team) => this.teamDone((((forms.find(x => x.form_type === "plan_setup" && x.aic_staff_id === team.aic_staff_id) || {}).data || {}).teams || {})[team.team_no]);
      const done = teams.filter(answered).length, capsOk = this.capsDone(caps);
      return { open: capsOk && done === teams.length, capsOk, done, total: teams.length, campaign: c.id };
    } catch (e) { return { open: true }; } })();
  },
};
async function applyPlanGate(root) {
  const g = await PS.gate(); if (g.open) return g;
  (root || document).querySelectorAll("a[data-gate]").forEach(a => { a.classList.add("locked"); a.title = "Answer the plan questionnaire first"; if (!a.querySelector(".lk")) a.insertAdjacentHTML("beforeend", ' <i class="bi bi-lock-fill lk" style="margin-left:auto;font-size:.75rem"></i>');
    a.addEventListener("click", (e) => { e.preventDefault(); location.href = navHref("pages/plan-setup.html"); }); });
  return g;
}

function renderSidebar(activeHref) {
  const mount = document.getElementById("sidebar-mount");
  if (!mount) return;
  if (new URLSearchParams(location.search).get("embed") === "1" || window.self !== window.top) { document.body.classList.add("embed"); mount.innerHTML = ""; return; }
  const here = activeHref || window.location.pathname.split("/").pop();
  const groups = NAV_GROUPS.map(g => {
    const isActive = g.links.some(l => l.href.split("/").pop() === here);
    return `<div class="nav-group ${isActive ? "active" : ""}"><button class="nav-gbtn" type="button"><i class="bi ${g.icon}"></i> ${g.label} <i class="bi bi-chevron-down" style="font-size:.7rem"></i></button>
      <div class="nav-menu">${g.links.map(l => `<a href="${navHref(l.href)}" ${l.gate ? 'data-gate="1"' : ""} class="${l.href.split("/").pop() === here ? "active" : ""}"><i class="bi ${l.icon}"></i>${l.label}</a>`).join("")}</div></div>`;
  }).join("");
  mount.innerHTML = `
    <div class="brand"><a href="${navHref("dashboard.html")}"><i class="bi bi-shield-plus"></i><span>Polio Dashboard<small>Layyah district — UC Fateh Pur Urban</small></span></a></div>
    <button class="nav-burger" id="navBurger" type="button" aria-label="Menu"><i class="bi bi-list"></i></button>
    <nav class="nav-groups">${groups}<a class="nav-gbtn nav-pdf ${here === "download-micro-plan.html" ? "on" : ""}" ${PDF_LINK.gate ? 'data-gate="1"' : ""} href="${navHref(PDF_LINK.href)}"><i class="bi ${PDF_LINK.icon}"></i> ${PDF_LINK.label}</a></nav>
    <div class="signout"><button id="signOutBtn"><i class="bi bi-box-arrow-right"></i> Sign out</button></div>`;
  document.getElementById("signOutBtn").addEventListener("click", signOut);
  document.getElementById("navBurger").addEventListener("click", () => mount.classList.toggle("nav-open"));
  mount.querySelectorAll(".nav-gbtn").forEach(b => b.addEventListener("click", (e) => {
    e.stopPropagation(); const g = b.parentElement, was = g.classList.contains("open");
    mount.querySelectorAll(".nav-group.open").forEach(x => x.classList.remove("open")); if (!was) g.classList.add("open");
  }));
  document.addEventListener("click", () => mount.querySelectorAll(".nav-group.open").forEach(x => x.classList.remove("open")));
  applyPlanGate(mount);
  applyRoleGate(mount);
}
/* Login accounts are for administrators and UCMOs only. This hides the menu item; the staff-accounts function and the
   database refuse everybody else on the server side, so a direct link or hand-made request cannot get around it. */
async function applyRoleGate(mount) {
  try {
    const p = typeof loadCurrentProfile === "function" ? await loadCurrentProfile() : null; if (!p || !p.role) return;
    if (!["admin", "ucmo"].includes(p.role)) mount.querySelectorAll('a[href$="accounts.html"]').forEach(a => a.remove());
  } catch (e) { /* the menu stays as it is; the server still enforces the rule */ }
}
