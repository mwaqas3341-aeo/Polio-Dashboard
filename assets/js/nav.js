// Shared top bar. Same three groups as the dashboard cards.
const NAV_GROUPS = [
  { key: "campaign", icon: "bi-flag-fill", label: "Campaign Management", links: [
    { href: "pages/campaigns.html", icon: "bi-calendar-event", label: "Campaign Details" },
    { href: "pages/daily-reports.html", icon: "bi-clipboard-data", label: "Daily reports (quick entry)" },
    { href: "pages/two-a-form.html", icon: "bi-file-earmark-text", label: "2A form (generate & print)" },
    { href: "pages/audit-log.html", icon: "bi-shield-check", label: "Audit log" },
  ]},
  { key: "staff", icon: "bi-people-fill", label: "Staff Management", links: [
    { href: "pages/staff.html", icon: "bi-person-badge", label: "Staff Management" },
    { href: "pages/accounts.html", icon: "bi-key", label: "Login accounts" },
    { href: "pages/cnic-lists.html", icon: "bi-card-list", label: "CNIC lists (PDF)" },
    { href: "pages/staff-pdf.html", icon: "bi-file-earmark-person", label: "Staff PDF (CNIC, AIC)" },
    { href: "pages/ddm-cards.html", icon: "bi-postcard", label: "DDM cards" },
    { href: "pages/payments.html", icon: "bi-wallet2", label: "Payment lists" },
  ]},
  { key: "plan", icon: "bi-diagram-3-fill", label: "Plan Management", links: [
    { href: "pages/uc-package.html", icon: "bi-box-seam", label: "Complete plan package (PDF)" },
    { href: "pages/microplan.html", icon: "bi-journal-richtext", label: "Microplan (auto)" },
    { href: "pages/operational-plan.html", icon: "bi-signpost-split", label: "Operational Plan" },
    { href: "pages/fixed-transit-plan.html", icon: "bi-geo-alt", label: "Fixed & Transit plan" },
    { href: "pages/maps.html", icon: "bi-map", label: "Maps (UC / AIC / day) — print" },
    { href: "pages/supervision-forms.html", icon: "bi-ui-checks", label: "Desk review, validation, tour plan" },
    { href: "pages/uc-forms.html", icon: "bi-building", label: "UC summary & social mobilization" },
    { href: "pages/schools.html", icon: "bi-mortarboard", label: "School list" },
    { href: "pages/mmp.html", icon: "bi-telephone", label: "MMP / CNIC list" },
    { href: "pages/households.html", icon: "bi-house", label: "House registration" },
    { href: "pages/missed-children.html", icon: "bi-person-exclamation", label: "Missed children" },
    { href: "pages/team-targets.html", icon: "bi-bullseye", label: "Team targets (set by AIC)" },
    { href: "pages/team-plan.html", icon: "bi-table", label: "Register totals (reference)" },
    { href: "pages/logistics.html", icon: "bi-truck", label: "Logistic plan (from targets)" },
    { href: "pages/area-summary.html", icon: "bi-bar-chart", label: "Area Incharge summary" },
    { href: "pages/supervision.html", icon: "bi-eye", label: "Supervision visits" },
  ]},
];
const NAV_LINKS = [{ href: "dashboard.html", label: "Dashboard" }].concat(NAV_GROUPS.flatMap(g => g.links));

function navHref(h) {
  const inPages = window.location.pathname.includes("/pages/");
  return inPages ? (h.startsWith("pages/") ? h.replace("pages/", "") : "../" + h) : h;
}

function renderSidebar(activeHref) {
  const mount = document.getElementById("sidebar-mount");
  if (!mount) return;
  const here = activeHref || window.location.pathname.split("/").pop();
  const groups = NAV_GROUPS.map(g => {
    const isActive = g.links.some(l => l.href.split("/").pop() === here);
    return `<div class="nav-group ${isActive ? "active" : ""}"><button class="nav-gbtn" type="button"><i class="bi ${g.icon}"></i> ${g.label} <i class="bi bi-chevron-down" style="font-size:.7rem"></i></button>
      <div class="nav-menu">${g.links.map(l => `<a href="${navHref(l.href)}" class="${l.href.split("/").pop() === here ? "active" : ""}"><i class="bi ${l.icon}"></i>${l.label}</a>`).join("")}</div></div>`;
  }).join("");
  mount.innerHTML = `
    <div class="brand"><a href="${navHref("dashboard.html")}"><i class="bi bi-shield-plus"></i><span>Polio Dashboard<small>Layyah district — UC Fateh Pur Urban</small></span></a></div>
    <button class="nav-burger" id="navBurger" type="button" aria-label="Menu"><i class="bi bi-list"></i></button>
    <nav class="nav-groups">${groups}</nav>
    <div class="signout"><button id="signOutBtn"><i class="bi bi-box-arrow-right"></i> Sign out</button></div>`;
  document.getElementById("signOutBtn").addEventListener("click", signOut);
  document.getElementById("navBurger").addEventListener("click", () => mount.classList.toggle("nav-open"));
  mount.querySelectorAll(".nav-gbtn").forEach(b => b.addEventListener("click", (e) => {
    e.stopPropagation(); const g = b.parentElement, was = g.classList.contains("open");
    mount.querySelectorAll(".nav-group.open").forEach(x => x.classList.remove("open")); if (!was) g.classList.add("open");
  }));
  document.addEventListener("click", () => mount.querySelectorAll(".nav-group.open").forEach(x => x.classList.remove("open")));
}
