const NAV_LINKS = [
  { href: "dashboard.html", label: "Dashboard" },
  { href: "pages/campaigns.html", label: "Campaigns" },
  { href: "pages/teams.html", label: "Teams & staff" },
  { href: "pages/schools.html", label: "School list" },
  { href: "pages/mmp.html", label: "MMP / CNIC list" },
  { href: "pages/households.html", label: "House registration" },
  { href: "pages/missed-children.html", label: "Missed children" },
  { href: "pages/team-plan.html", label: "Team day plan (auto)" },
  { href: "pages/logistics.html", label: "Logistic plan (auto)" },
  { href: "pages/area-summary.html", label: "Area Incharge summary" },
  { href: "pages/daily-reports.html", label: "Daily reports (quick entry)" },
  { href: "pages/two-a-form.html", label: "2A form (generate & print)" },
  { href: "pages/supervision.html", label: "Supervision visits" },
  { href: "pages/ddm-cards.html", label: "DDM cards" },
  { href: "pages/audit-log.html", label: "Audit log" },
];

function renderSidebar(activeHref) {
  const mount = document.getElementById("sidebar-mount");
  if (!mount) return;
  const here = window.location.pathname.split("/").pop();
  const links = NAV_LINKS.map(l => {
    const file = l.href.split("/").pop();
    const cls = file === (activeHref || here) ? "active" : "";
    // Adjust relative path depending on whether we're inside /pages/
    const inPages = window.location.pathname.includes("/pages/");
    const href = inPages && !l.href.startsWith("pages/") ? "../" + l.href
               : !inPages && l.href.startsWith("pages/") ? l.href
               : inPages ? l.href.replace("pages/", "")
               : l.href;
    return `<a href="${href}" class="${cls}">${l.label}</a>`;
  }).join("");

  mount.innerHTML = `
    <div class="brand">Polio Dashboard<small>Layyah district — UC Fateh Pur Urban</small></div>
    <nav>${links}</nav>
    <div class="signout"><button id="signOutBtn">Sign out</button></div>
  `;
  document.getElementById("signOutBtn").addEventListener("click", signOut);
}
