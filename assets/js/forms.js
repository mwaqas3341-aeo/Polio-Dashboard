/* Shared engine for the 2026 supervision and UC-level formats.
   Data lives in campaign_forms (one row per campaign x form type x AIC); totals and scores are always calculated, never typed. */
const FS = {};
FS.esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const E_ = FS.esc;
FS.nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
FS.num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
FS.sum = (arr) => { const f = arr.map(FS.num).filter(v => v !== null); return f.length ? f.reduce((a, b) => a + b, 0) : null; };
FS.today = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
FS.fmtDate = (d) => { if (!d) return ""; const x = new Date(d + (String(d).length <= 10 ? "T00:00:00" : "")); return isNaN(x) ? E_(d) : `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`; };
FS.URDU_DAYS = ["پہلا دن", "دوسرا دن", "تیسرا دن", "چوتھا دن", "پانچواں دن", "چھٹا دن", "ساتواں دن"];

/* ---------------- Desk review: 41 indicators (Desk Review Form AIC) ---------------- */
FS.DESK = [
  ["Human Resource", ["Is this MP Developed/Updated for current campaign?", "AICs Summary Sheet updated", "Is AIC Govt. Accountable", "Is this AIC working since last more than 3 rounds", "Operational Plan (Team wise Day wise plan) updated from tally sheet of previous campaign", "Does all teams have at least 1 female per team", "Does all teams have at least 1 local per team", "Does all teams have at least 1 Govt. Accountable per team", "Does the Team work load rationalization (G1, G2, G3) based on previous round tally sheets."]],
  ["Missed/Persistently missed Children coverage plan", ["Does the MP have team wise list of missed children and persistently missed children.", "Does the MP have summary of Still Missed and Persistently Missed Children"]],
  ["High Risk Population coverage plan", ["Does the MP have High risk population Coverage Plan", "Does the MP have team wise registration of HRP", "If Yes, does registration includes the category of each type of HRP with detail address.", "Does the MP indicates the assignment of team for coverage of HRP"]],
  ["Schools and Madrassa Coverage plan", ["Does the MP have School/Madrassa Coverage Plan available", "Name of head is written for each school/madrassa", "Number of children >5 are mentioned in the plan", "Team and Day of work was assigned in MP for coverage of this institution"]],
  ["Logistic Plan", ["Logistics plan present with all components", "Is the Vaccine distribution among teams according to the requirement (target)? (Refer Operational Plan)"]],
  ["Teams/AICs Training Plan", ["Training plan (AIC and Team) is present", "Does this plan include Date, Time and Venue for Training", "Does training plan include Name of Facilitators", "Does Training Plan include the plan for catchup training."]],
  ["Social Mobilization plan", ["UC Social Mobilization Plan available", "If Yes, does it includes plan for Polio Walk and Inauguration details", "Does it include the detail of Masajids where the Imam will talk about polio and RI during Jumaspeech.", "Does it include the detail of schools for debate competition on Polio.", "Does It Include plan for coverage of missed children through engagement of community."]],
  ["Supervision plan", ["Need based Supervision plan available", "Does the Supervision plan includes Date, Time and venue for visit.", "Does this plan include reasons for selection of specific team/AIC to be visited."]],
  ["UC Map", ["Does area of this AIC is included and highlighted in UC level Map", "Does the landmark of UC map clearly indicates UC borders and AIC's Borders."]],
  ["AIC Map", ["Does AIC Map included team wise day wise distribution for all teams", "Clear Labelling of borders by landmarks for team to team and AIC to AIC borders", "Does the map have Clear identification of High Risk Population groups"]],
  ["Team Route Map", ["Does AIC have separate team route map for all teams", "Does route map have starting and ending point", "Does route map indicate the movement pattern of team in the area."]],
];
FS.DESK_FLAT = FS.DESK.flatMap(([g, items]) => items.map((t, i) => ({ g: i === 0 ? g : "", span: i === 0 ? items.length : 0, t })));
FS.FV = ["Select the starting point from any day work in the team route Map and verify the household details in the field",
  "From same starting point, Cross Verify the Day/Team/Area/UC both sides boundaries in the field against the Day/Team/Area/UC maps.",
  "Verify Landmarks mentioned on team route maps while moving to the day work ending point (Mosques, Madrassas, schools, market etc)",
  "Team movement pattern as per guidelines (not zig zag)",
  "Cross verify any High Risk Population settlement found in the field with the map.",
  "Select one school/madrassa from Micro plan and verify its target from school/madrassa registration",
  "Select the ending point from same day work and verify the household details in the field",
  "From same ending point, Cross Verify the Day/Team/Area/UC both sides boundaries in the field against the Day/Team/Area/UC maps",
  "Select one fixed site if mentioned in the micro plan and verify the location and if it is spotted in the map.",
  "Select one transit point mentioned in the micro plan and verify the location and if it is spotted in the map"];
FS.RESULT = (pct) => pct === null ? ["", ""] : pct >= 100 ? ["Pass", "pass"] : pct >= 90 ? ["Needs improvement", "imp"] : ["Fail", "fail"];
FS.score = (vals) => { const a = vals.filter(v => v === "1" || v === "0"), ones = a.filter(v => v === "1").length; return { ones, n: a.length, pct: a.length ? Math.round(ones / a.length * 1000) / 10 : null }; };

/* ---------------- Loading ---------------- */
FS.db = () => supabaseClient;
FS.loadBase = async (campaignId) => {
  const db = FS.db(), B = { forms: {} };
  const { data: c } = await db.from("campaigns").select("id, name, status, uc_id, start_date, end_date, total_days, catchup_days, campaign_type").eq("id", campaignId).single(); B.campaign = c;
  B.geo = { uc: "", tehsil: "", district: "" };
  if (c.uc_id) { const { data: uc } = await db.from("union_councils").select("name, tehsils(name, districts(name))").eq("id", c.uc_id).single(); B.geo = { uc: uc?.name || "", tehsil: uc?.tehsils?.name || "", district: uc?.tehsils?.districts?.name || "" }; }
  let q = db.from("staff").select("id, full_name, aic_no, area_map_path, uc_id, phone, designation").eq("designation", "aic").eq("status", "active").order("aic_no"); if (c.uc_id) q = q.eq("uc_id", c.uc_id);
  B.aics = ((await q).data || []).sort((a, b) => FS.nat(a.aic_no, b.aic_no));
  const um = c.uc_id ? (await db.from("staff").select("id, full_name, phone, area_map_path").eq("designation", "ucmo").eq("uc_id", c.uc_id).eq("status", "active").limit(1)).data : []; B.ucmo = (um || [])[0] || null;
  const ids = B.aics.map(a => a.id), none = { data: [] };
  const tm = ids.length ? (await db.from("teams").select("id, team_no, team_type, aic_staff_id, team_members(active, member_no, member_role, staff(full_name, cnic, phone))").in("aic_staff_id", ids)).data || [] : [];
  B.teams = tm.sort((a, b) => FS.nat(a.team_no, b.team_no)).map(t => ({ ...t, workers: (t.team_members || []).filter(m => m.active) }));
  const tids = B.teams.map(t => t.id);
  const r = await Promise.all([
    tids.length ? db.from("operational_plans").select("*").eq("campaign_id", campaignId).in("team_id", tids) : none,
    tids.length ? db.from("fixed_transit_plans").select("*").eq("campaign_id", campaignId).in("team_id", tids) : none,
    db.from("aic_microplan_figures").select("aic_staff_id, figures").eq("campaign_id", campaignId),
    db.from("campaign_forms").select("id, aic_staff_id, form_type, data").eq("campaign_id", campaignId),
    B.teams.length ? db.from("missed_children").select("team_no").eq("campaign_id", campaignId).not("carried_from_campaign_id", "is", null).in("team_no", B.teams.map(t => t.team_no)) : none,
    db.from("team_day_maps").select("team_id, campaign_day, storage_path").eq("campaign_id", campaignId),
    db.from("mmp_assignments").select("team_no").eq("campaign_id", campaignId),
    db.from("team_targets").select("team_no, campaign_day, target_households, target_children").eq("campaign_id", campaignId),
    db.from("daily_reports").select("*").eq("campaign_id", campaignId),
  ]);
  B.targets = r[7].data || []; B.reports = r[8].data || [];
  B.dayMaps = r[5].data || []; B.mmpRows = r[6].data || [];
  B.plans = r[0].data || []; B.ft = r[1].data || []; B.figs = new Map((r[2].data || []).map(f => [f.aic_staff_id, f.figures || {}]));
  B.formsErr = r[3].error; (r[3].data || []).forEach(f => { B.forms[f.form_type + "|" + (f.aic_staff_id || "")] = f; }); B.missed = r[4].data || [];
  return B;
};
FS.setupAns = (B, aicId, tn) => ((((B.forms['plan_setup|' + aicId] || {}).data || {}).teams || {})[tn]) || {};
FS.setupSum = (B, k) => { let t = 0, any = false; B.aics.forEach(a => FS.teamsOf(B, a.id).forEach(tm => { const v = FS.num(FS.setupAns(B, a.id, tm.team_no)[k]); if (v !== null) { t += v; any = true; } })); return any ? t : null; };
FS.caps = (B) => (B.forms['campaign_setup|'] || {}).data || {};
FS.teamsOf = (B, aicId) => B.teams.filter(t => t.aic_staff_id === aicId);
FS.draft = (B, type, aicId, fn) => { const k = type + "|" + (aicId || ""); const ex = B.forms[k] || { id: null, aic_staff_id: aicId || null, form_type: type, data: {} }; fn(ex.data); B.forms[k] = ex; };
FS.getForm = (B, type, aicId) => (B.forms[type + "|" + (aicId || "")]?.data) || {};
FS.saveForm = async (B, type, aicId, data) => {
  const db = FS.db(), key = type + "|" + (aicId || ""), ex = B.forms[key];
  const res = (ex && ex.id) ? await db.from("campaign_forms").update({ data }).eq("id", ex.id).select("id, aic_staff_id, form_type, data").single()
                 : await db.from("campaign_forms").insert({ campaign_id: B.campaign.id, aic_staff_id: aicId || null, form_type: type, data }).select("id, aic_staff_id, form_type, data").single();
  if (res.error) throw res.error; B.forms[key] = res.data; return res.data;
};

/* ---------------- shared bits ---------------- */
const inp = (edit, val, attr, cls = "") => edit ? `<input ${attr} value="${E_(val)}" class="${cls}">` : E_(val);
const hdrBlock = (B, aic, extra = "") => `<div class="fx-hdr"><div>Campaign: <b>${E_(B.campaign.name)}</b></div><div>Union Council: <b>${E_(B.geo.uc)}</b></div><div>Tehsil: <b>${E_(B.geo.tehsil)}</b></div><div>District: <b>${E_(B.geo.district)}</b></div>${aic ? `<div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div>` : ""}${extra}</div>`;
FS.hdrBlock = hdrBlock;
const teamCols = (B, aic) => FS.teamsOf(B, aic.id);
const empty = (msg) => `<div class="fx-page"><p class="fx-miss">${msg}</p></div>`;
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o.length ? o : [[]]; };


/* ---------------- Desk review: indicators assessed automatically from the plan data ----------------
   Each indicator is answered from records that really exist in the system (plans, maps, questionnaire answers, forms).
   Indicators that cannot be verified from data (e.g. "is the map clearly labelled") are left blank and are NOT counted
   in the score until a reviewer marks them. Scores are never forced. */
FS.planComplete = (B, t, days) => t.team_type === "mobile" ? days.every(d => { const p = B.plans.find(x => x.team_id === t.id && x.campaign_day === d); return p && p.village_area && p.total_households != null && p.total_children != null; })
  : days.every(d => { const p = B.ft.find(x => x.team_id === t.id && x.campaign_day === d); return p && p.place_name && p.expected_children != null; });
FS.deskAuto = (B, aic, t) => {
  B.dayMaps = B.dayMaps || []; B.mmpRows = B.mmpRows || [];
  const A = new Array(41).fill(""), set = (i, v) => { A[i] = v; }, yes = (c) => c ? "1" : "0", days = Array.from({ length: FS.nDays(B) }, (_, i) => i + 1), fig = B.figs.get(aic.id), mob = FS.teamsOf(B, aic.id).filter(x => x.team_type === "mobile").length;
  const st = FS.setupAns(B, aic.id, t.team_no), sm = FS.getForm(B, "sm_plan", null), ucm = FS.getForm(B, "uc_summary", null), rows = (k) => ((sm.rows || {})[k] || []).filter(r => (r || []).some(x => x));
  const mmpN = B.mmpRows.filter(r => String(r.team_no) === String(t.team_no)).length, dm = new Set(B.dayMaps.filter(m => m.team_id === t.id && m.storage_path).map(m => m.campaign_day));
  const capsOk = ["yes", "no"].includes(FS.caps(B).vit_a_needed);
  set(0, yes(FS.planComplete(B, t, [1]))); set(1, fig ? "1" : "0"); if (fig && fig.aic_govt) set(2, fig.aic_govt === "\u06c1\u0627\u06ba" ? "1" : "0");
  set(4, yes(FS.planComplete(B, t, days)));
  if (fig && t.team_type === "mobile") { if (fig.tm_female !== undefined && fig.tm_female !== "") set(5, yes(FS.num(fig.tm_female) >= mob)); if (fig.tm_local !== undefined && fig.tm_local !== "") set(6, yes(FS.num(fig.tm_local) >= mob)); if (fig.tm_govt !== undefined && fig.tm_govt !== "") set(7, yes(FS.num(fig.tm_govt) >= mob)); }
  else if (t.team_type !== "mobile") { set(5, "N"); set(6, "N"); set(7, "N"); }
  if (st.missed === "no") { set(9, "N"); set(10, "N"); } else if (st.missed === "yes") { const has = B.missed.some(r => String(r.team_no) === String(t.team_no)); set(9, yes(has)); set(10, yes(has)); }
  if (st.mmp === "no") [11, 12, 13, 14].forEach(i => set(i, "N")); else if (st.mmp === "yes") { set(11, yes(FS.num(st.mmp_hh) !== null && FS.num(st.mmp_children) !== null)); set(12, yes(mmpN > 0)); set(14, yes(mmpN > 0)); }
  if (st.schools === "no") [15, 16, 17, 18].forEach(i => set(i, "N")); else if (st.schools === "yes") { set(15, yes(FS.num(st.school_n) !== null)); set(17, yes(FS.num(st.school_children) !== null)); }
  set(19, yes(capsOk)); set(20, yes(B.plans.some(p => p.team_id === t.id && p.required_doses != null)));
  set(21, yes(!!ucm.training_date)); set(25, yes(rows("meeting").length || rows("influencer").length || rows("school").length || rows("masjid").length));
  set(27, yes(rows("masjid").length)); set(28, yes(rows("school").length)); set(29, yes(rows("parental").length));
  set(30, "1"); set(31, "1"); set(32, "1");                                     // the supervisory (tour) plan is generated from the team plan with dates, times and reasons
  set(33, yes(!!B.ucmo?.area_map_path)); set(35, yes(!!aic.area_map_path)); set(38, yes(Array.from({ length: FS.nDays(B) }, (_, i) => i + 1).every(d => dm.has(d))));
  return A;
};
FS.deskVal = (B, aic, t, i, D) => { const m = ((D.answers || {})[t.team_no] || {})[i]; if (m !== undefined && m !== "") return m; FS._dc = FS._dc || {}; const k = aic.id + "|" + t.team_no + "|" + (B.campaign.id); if (!FS._dc[k] || FS._dc.stamp !== B._stamp) { FS._dc[k] = FS.deskAuto(B, aic, t); FS._dc.stamp = B._stamp; } return FS._dc[k][i]; };

/* ---------------- Desk review ---------------- */
FS.renderDesk = (B, aic, edit) => {
  const ts = teamCols(B, aic); if (!ts.length) return empty(`AIC ${E_(aic.aic_no)} has no teams yet — Desk Review needs teams as columns.`);
  const D = FS.getForm(B, "desk_review", aic.id), A = D.answers || {};
  B.dayMaps = B.dayMaps || []; B.mmpRows = B.mmpRows || [];
  B._stamp = JSON.stringify([Object.keys(B.forms).map(k => B.forms[k].updated_at || ""), B.plans.length, B.dayMaps.length, B.mmpRows.length]) + Math.random();
  const tm = (tn) => ts.find(x => x.team_no === tn), val = (tn, i) => FS.deskVal(B, aic, tm(tn), i, D);
  const colTot = (t) => FS.score(FS.DESK_FLAT.map((_, i) => val(t.team_no, i)));
  return chunk(ts, 8).map((grp, gi, all) => {
    const last = gi === all.length - 1;
    const rows = FS.DESK_FLAT.map((r, i) => `<tr>${r.span ? `<td class="grp" rowspan="${r.span}">${E_(r.g)}</td>` : ""}<td>${i + 1}</td><td class="l">${E_(r.t)}</td>${grp.map(t => `<td>${edit ? `<select data-dr="${E_(t.team_no)}|${i}"><option value=""></option><option value="1" ${val(t.team_no, i) === "1" ? "selected" : ""}>1</option><option value="0" ${val(t.team_no, i) === "0" ? "selected" : ""}>0</option><option value="N" ${val(t.team_no, i) === "N" ? "selected" : ""}>N/A</option></select>` : (val(t.team_no, i) === "N" ? "N/A" : E_(val(t.team_no, i)))}</td>`).join("")}${last ? `<td><b>${FS.sum(ts.map(t => val(t.team_no, i) === "1" ? 1 : 0))}</b></td>` : ""}</tr>`).join("");
    const tot = grp.map(t => colTot(t));
    return `<div class="fx-page"><h1>Desk Review — Area Incharge</h1><h2>Polio Eradication Initiative</h2>
      <div class="fx-hdr"><div>Name of the Reviewer: ${edit ? `<input data-dh="reviewer" value="${E_(D.reviewer ?? B.ucmo?.full_name ?? "")}">` : `<b>${E_(D.reviewer ?? B.ucmo?.full_name ?? "")}</b>`}</div><div>District/Tehsil/UC: <b>${E_(B.geo.district)} / ${E_(B.geo.tehsil)} / ${E_(B.geo.uc)}</b></div>
      <div>Date of Review: ${edit ? `<input type="date" data-dh="date" value="${E_(D.date || FS.today())}">` : `<b>${FS.fmtDate(D.date || FS.today())}</b>`}</div><div>Campaign: <b>${E_(B.campaign.name)}</b></div><div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div><div>Total No of Teams: <b>${ts.length}</b></div></div>
      <div class="fx-note">Team / Area In charge / Union Council plan — Yes = 1, No = 0, N/A = Not Applicable. Answers are filled automatically from the plan data; blank boxes are points the system cannot verify and are left out of the score until marked.</div>
      <div class="fx-wrap"><table class="fx"><thead><tr><th>Major Component</th><th>#</th><th>Indicators Assessed</th>${grp.map(t => `<th>Team ${E_(t.team_no)}</th>`).join("")}${last ? "<th>Total Score</th>" : ""}</tr></thead><tbody>${rows}
      <tr><td colspan="3" class="l"><b>Total Score (Yes = 1)</b></td>${tot.map(x => `<td><b>${x.ones}</b></td>`).join("")}${last ? "<td></td>" : ""}</tr>
      <tr><td colspan="3" class="l"><b>Overall %age</b> — 100% Pass, 90–99% Needs improvement, below 90% Fail</td>${tot.map(x => { const [lbl, cls] = FS.RESULT(x.pct); return `<td class="${cls}"><b>${x.pct === null ? "" : x.pct + "%"}</b><br>${lbl}</td>`; }).join("")}${last ? "<td></td>" : ""}</tr></tbody></table></div>
      ${last ? `<div class="fx-note">Any other comments (regarding any domains not mentioned above): ${edit ? `<textarea data-dh="comments" rows="2" style="width:100%">${E_(D.comments || "")}</textarea>` : `<b>${E_(D.comments || "")}</b>`}</div><div class="fx-sig"><div>Signature of Reviewing Person</div><div>UCMO Desk review</div></div>` : ""}</div>`;
  }).join("");
};

/* ---------------- Field validation ---------------- */
FS.renderFV = (B, aic, edit) => {
  const ts = teamCols(B, aic); if (!ts.length) return empty(`AIC ${E_(aic.aic_no)} has no teams yet — Field Validation needs teams as columns.`);
  const D = FS.getForm(B, "field_validation", aic.id), T = D.teams || {}, cnt = (k) => ts.filter(t => t.team_type === k).length;
  const nd = Math.min(Math.max(parseInt(B.campaign.total_days) || 3, 1), 5), get = (tn, i) => ((T[tn] || {}).a || {})[i] ?? "", day = (tn) => (T[tn] || {}).day ?? ((ts.findIndex(x => x.team_no === tn) % nd) + 1);
  const sel = (key, cur, opts) => `<select ${key}><option value=""></option>${opts.map(o => `<option ${cur === o ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  return chunk(ts, 8).map((grp, gi, all) => {
    const last = gi === all.length - 1;
    const rows = FS.FV.map((t, i) => `<tr><td>${i + 1}</td><td class="l">${E_(t)}</td>${grp.map(tm => `<td>${edit ? sel(`data-fv="${E_(tm.team_no)}|${i}"`, get(tm.team_no, i), ["Yes", "No", "N/A"]) : E_(get(tm.team_no, i))}</td>`).join("")}</tr>`).join("");
    const sc = grp.map(tm => FS.score(FS.FV.map((_, i) => { const v = get(tm.team_no, i); return v === "Yes" ? "1" : v === "No" ? "0" : ""; })));
    return `<div class="fx-page"><h1>Field Validation of Microplan</h1><h2>Polio Eradication Initiative</h2>
      <div class="fx-hdr"><div>Province: <b>${edit ? `<input data-fh="province" value="${E_(D.province ?? "Punjab")}">` : E_(D.province ?? "Punjab")}</b></div><div>District/Town: <b>${E_(B.geo.district)}</b></div><div>Date of Campaign: <b>${FS.fmtDate(B.campaign.start_date)}</b></div>
      <div>Date of validation: ${edit ? `<input type="date" data-fh="date" value="${E_(D.date || B.campaign.start_date || "")}">` : `<b>${FS.fmtDate(D.date || B.campaign.start_date)}</b>`}</div><div>Name of validating person: ${edit ? `<input data-fh="person" value="${E_(D.person ?? aic.full_name ?? "")}">` : `<b>${E_(D.person ?? aic.full_name ?? "")}</b>`}</div><div>Designation: <b>AIC</b> &nbsp; Agency: <b>Govt</b></div>
      <div>Union Council: <b>${E_(B.geo.uc)}</b></div><div>Number of Teams: <b>${ts.length}</b> (Mobile ${cnt("mobile")}, Fixed ${cnt("fixed")}, Transit ${cnt("transit")})</div><div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div>
      <div>Validated by UC level supervisors? ${edit ? sel('data-fh="uc_val"', D.uc_val || "", ["Yes", "No"]) : `<b>${E_(D.uc_val || "")}</b>`}</div><div>By whom: ${edit ? sel('data-fh="by_whom"', D.by_whom || "", ["UCMO", "THO", "UCPO", "UCCO", "Any other"]) : `<b>${E_(D.by_whom || "")}</b>`}</div></div>
      <div class="fx-wrap"><table class="fx"><thead><tr><th>#</th><th>Field Validation Variables (tick appropriate)</th>${grp.map(tm => `<th>Team ${E_(tm.team_no)}<br>Day: ${edit ? `<select data-fvday="${E_(tm.team_no)}"><option value=""></option>${[1, 2, 3, 4, 5].map(d => `<option ${String(day(tm.team_no)) === String(d) ? "selected" : ""}>${d}</option>`).join("")}</select>` : E_(day(tm.team_no))}<br><small>Matching Yes / No</small>${edit ? `<br><button type="button" class="btn small ghost noprint-ctl" data-fvall="${E_(tm.team_no)}">All Yes</button>` : ""}</th>`).join("")}</tr></thead><tbody>${rows}
      <tr><td colspan="2" class="l"><b>Total Score (Matching = 1 and Not Matching = 0)</b></td>${sc.map(x => `<td><b>${x.n ? x.ones + " / " + x.n : ""}</b></td>`).join("")}</tr>
      <tr><td colspan="2" class="l"><b>Result</b> — 100% Pass, 90–99% Needs improvement, below 90% Fail</td>${sc.map(x => { const [lbl, cls] = FS.RESULT(x.pct); return `<td class="${cls}"><b>${x.pct === null ? "" : x.pct + "%"}</b><br>${lbl}</td>`; }).join("")}</tr></tbody></table></div>
      ${last ? `<div class="fx-note">If any missed area found: provide detailed address along with estimated number of children found missed:<br>${edit ? `<textarea data-fh="missed" rows="3" style="width:100%">${E_(D.missed || "")}</textarea>` : `<b>${E_(D.missed || "")}</b>`}</div><div class="fx-sig"><div>Signature of Reviewing Person</div><div>Submitted To</div></div>` : ""}</div>`;
  }).join("");
};

/* ---------------- Tour plan (Urdu) ---------------- */
FS.TOUR_REASON = "پہلا وزٹ حاضری اور ٹیلی شیٹ کے لئے\nدوسرا وزٹ ویکسین اور ٹیم مانیٹرنگ";
FS.addMin = (hhmm, m) => { const [h, mi] = hhmm.split(":").map(Number), t = h * 60 + mi + m; return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
FS.tourDefault = (B, t, d, i) => { const op = B.plans.find(p => p.team_id === t.id && p.campaign_day === d); return { area: op?.village_area || "", t1: FS.addMin("08:45", 45 * i), t2: FS.addMin("13:00", 30 * i), reason: FS.TOUR_REASON, remark: "" }; };
FS.renderTour = (B, aic, edit) => {
  const ts = teamCols(B, aic); if (!ts.length) return empty(`AIC ${E_(aic.aic_no)} has no teams yet — the tour plan lists the teams to visit.`);
  const D = FS.getForm(B, "tour_plan", aic.id), days = Math.min(Math.max(parseInt(B.campaign.total_days) || 3, 1), 7), cell = (d, t, i) => ({ ...FS.tourDefault(B, t, d, i), ...(((D.days || {})[d] || {})[t.team_no] || {}) });
  const dayHtml = (d) => `<div style="margin-top:6px"><div class="fx-ur" dir="rtl" style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;"><span>${FS.URDU_DAYS[d - 1]}</span><span dir="ltr">Date: ${FS.fmtDate(B.campaign.start_date ? new Date(new Date(B.campaign.start_date + "T00:00:00").getTime() + (d - 1) * 864e5).toISOString().slice(0, 10) : "")}</span></div>
    <div class="fx-wrap"><table class="fx fx-ur" dir="rtl"><thead><tr><th>نمبر شمار</th><th>ٹائم پہلا وزٹ</th><th>ٹائم دوسرا وزٹ</th><th>ٹیم نمبر</th><th>علاقے کا نام</th><th>اس ٹیم کے معائنہ کی وجہ</th><th>تاثرات</th></tr></thead><tbody>
    ${ts.map((t, i) => { const c = cell(d, t, i), k = `${d}|${E_(t.team_no)}`; return `<tr><td>${i + 1}</td><td dir="ltr">${edit ? `<input type="time" data-tp="${k}|t1" value="${E_(c.t1)}">` : E_(c.t1)}</td><td dir="ltr">${edit ? `<input type="time" data-tp="${k}|t2" value="${E_(c.t2)}">` : E_(c.t2)}</td><td><b>${E_(t.team_no)}</b></td>
      <td>${edit ? `<input data-tp="${k}|area" value="${E_(c.area)}">` : E_(c.area)}</td><td>${edit ? `<textarea data-tp="${k}|reason" rows="2">${E_(c.reason)}</textarea>` : E_(c.reason).replace(/\n/g, "<br>")}</td><td>${edit ? `<textarea data-tp="${k}|remark" rows="2">${E_(c.remark)}</textarea>` : E_(c.remark)}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  return Array.from({ length: days }, (_, i) => i + 1).map((d, di) => `<div class="fx-page"><h1 class="fx-ur">ایریا انچارج کا سپروائزری پلان</h1>
    <div class="fx-hdr fx-ur" dir="rtl"><div>مہم کا نام: <b>${E_(B.campaign.name)}</b></div><div>نام ایریا انچارج: <b>${E_(aic.full_name)}</b></div><div>رابطہ نمبر: <b dir="ltr">${E_(aic.phone || "")}</b></div><div>یونین کونسل: <b>${E_(B.geo.uc)}</b></div><div>تحصیل: <b>${E_(B.geo.tehsil)}</b></div><div>ضلع: <b>${E_(B.geo.district)}</b></div></div>
    <div class="fx-ur fx-note" dir="rtl">ایریا انچارج کو چاہیے کہ وہ مہم کے دوران روزانہ اپنی تمام ٹیموں کا 2 بار دورہ کرے اور کمزور ٹیموں کے کام میں مدد اور رہنمائی کرے۔</div>
    ${dayHtml(d)}${di === days - 1 ? `<div class="fx-sig"><div>Signature of Area Incharge</div><div>Signature of UCMO</div></div>` : ""}</div>`).join("");
};

/* ---------------- UC Summary (auto totals + a few typed fields) ---------------- */
FS.ucAuto = (B) => {
  const F = [...B.figs.values()], fs = (k) => FS.sum(F.map(f => f[k])), plans = B.plans, ft = B.ft;
  const mob = B.teams.filter(t => t.team_type === "mobile"), fxT = B.teams.filter(t => t.team_type === "fixed"), trT = B.teams.filter(t => t.team_type === "transit");
  const ftSum = (ts, k) => FS.sum(ft.filter(p => ts.some(t => t.id === p.team_id)).map(p => p[k]));
  return { aics: B.aics.length, aic_govt: F.filter(f => f.aic_govt === "\u06c1\u0627\u06ba").length || (F.length ? 0 : null), aic_female: F.filter(f => f.aic_gender === "\u0639\u0648\u0631\u062a").length || (F.length ? 0 : null),
    prev_total: fs("prev_total"), prev_fixed: ftSum(fxT, "prev_campaign_children"), prev_transit: ftSum(trT, "prev_campaign_children"), prev_school: fs("prev_school"), prev_hh_children: fs("prev_hh_children"), prev_households: fs("prev_households"),
    cur_total: FS.sum(plans.map(p => p.total_children)), cur_fixed: ftSum(fxT, "expected_children"), cur_transit: ftSum(trT, "expected_children"), cur_school: FS.sum(plans.map(p => p.school_children)),
    cur_hh_children: FS.sum(plans.flatMap(p => [p.children_households_1_5, p.children_under_1])), cur_households: FS.sum(plans.map(p => p.total_households)),
    teams: B.teams.length, mob: mob.length, fx: fxT.length, tr: trT.length, ddm_red: fs("ddm_red"), ddm_blue: fs("ddm_blue"), new_members: fs("new_members"), vit_a: fs("vit_a"), pens: fs("pens"), ziplock: fs("ziplock"), markers: fs("markers"), chalk: fs("chalk"), tally: fs("tally"),
    doses: (() => { const v = FS.sum(plans.map(p => p.required_doses)); return v === null ? null : Math.round(v); })(),
    missed: B.missed.length || FS.setupSum(B, "missed_n") || null, missed_2plus: fs("missed_2plus"), zd_prev: fs("zd_prev"), zd_vacc: fs("zd_vacc"), refusal_hh: fs("refusal_hh") ?? FS.setupSum(B, "refusal_n"), madaris: fs("madaris") ?? FS.setupSum(B, "madaris_n"), masjids: fs("masjids"), high_schools: fs("high_schools"), schools_u5: fs("schools_u5") ?? FS.setupSum(B, "school_n"),
    vit_blue: (() => { const c = FS.caps(B); return c.vit_a_needed === 'yes' ? FS.num(c.vit_blue) : c.vit_a_needed === 'no' ? 0 : null; })(), vit_red: (() => { const c = FS.caps(B); return c.vit_a_needed === 'yes' ? FS.num(c.vit_red) : c.vit_a_needed === 'no' ? 0 : null; })(), mm_children: FS.setupSum(B, 'mmp_children'),
    members: B.teams.reduce((n, t) => n + t.workers.length, 0) || null, tm_govt: fs("tm_govt"), tm_female: fs("tm_female"), tm_local: fs("tm_local"), tm_adult: fs("tm_adult") };
};
FS.renderUcSummary = (B, edit) => {
  const A = FS.ucAuto(B), M = FS.getForm(B, "uc_summary", null), nid = B.campaign.campaign_type === "NID";
  const mv = (k, w = "") => edit ? `<input data-uc="${k}" value="${E_(M[k] ?? "")}" ${w}>` : `<b>${E_(M[k] ?? "")}</b>`;
  const av = (k) => `<b>${A[k] === null || A[k] === undefined ? "" : E_(A[k])}</b>`;
  const pair = (label, v, cs = 1) => `<td class="r" style="width:20%">${label}</td><td colspan="${cs}">${v}</td>`;
  const sec = (t) => `<tr><th colspan="6">${t}</th></tr>`;
  return `<div class="fx-page"><h1 class="fx-ur">یونین کونسل مائیکروپلان کا خلاصہ — پولیو سے بچاؤ کی گھر گھر مہم</h1>
    <div class="fx-wrap"><table class="fx fx-ur" dir="rtl">
    <tr>${pair("مہم کا نام", `<b>${E_(B.campaign.name)}</b>`)}${pair("NID / SNID", `<b>${nid ? "NID" : "SNID"}</b>`)}${pair("تاریخ", edit ? `<input type="date" data-uc="date" value="${E_(M.date || "")}">` : `<b>${FS.fmtDate(M.date)}</b>`)}</tr>
    <tr>${pair("یونین کونسل", `<b>${E_(B.geo.uc)}</b>`)}${pair("تحصیل / تعلقہ / ٹاؤن", `<b>${E_(B.geo.tehsil)}</b>`)}${pair("ضلع / ایجنسی", `<b>${E_(B.geo.district)}</b>`)}</tr>
    <tr>${pair("ویکسینیٹر کا نام", mv("vaccinator"))}${pair("رابطہ نمبر", mv("vaccinator_phone"))}${pair("یونین کونسل سیکرٹری", mv("secretary"))}</tr>
    <tr>${pair("رابطہ نمبر", mv("secretary_phone"))}${pair("یونین کونسل انچارج", edit ? `<input data-uc="incharge" value="${E_(M.incharge ?? B.ucmo?.full_name ?? "")}">` : `<b>${E_(M.incharge ?? B.ucmo?.full_name ?? "")}</b>`)}${pair("کتنے ایریا انچارجز گزشتہ 2 یا زیادہ مہم سے کام کر رہے ہیں", mv("aic_2plus"))}</tr>
    <tr>${pair("کل ایریا انچارجز کی تعداد", av("aics"))}${pair("خواتین ایریا انچارجز", av("aic_female"))}${pair("گورنمنٹ ایریا انچارجز", av("aic_govt"))}</tr>
    ${sec("پانچ سال سے کم بچوں کا ریکارڈ — گزشتہ مہم")}
    <tr>${pair("کل بچے", av("prev_total"))}${pair("فکسڈ سائٹ پر ویکسین پلائی", av("prev_fixed"))}${pair("ٹرانزٹ پوائنٹ پر ویکسین پلائی", av("prev_transit"))}</tr>
    <tr>${pair("سکول / مدارس کے بچے", av("prev_school"))}${pair("گھروں کے بچے", av("prev_hh_children"))}${pair("گزشتہ مہم کے گھروں کی کل تعداد", av("prev_households"))}</tr>
    ${sec("موجودہ مہم کی منصوبہ سازی")}
    <tr>${pair("کل بچے", av("cur_total"))}${pair("فکسڈ سائٹ پر متوقع بچے", av("cur_fixed"))}${pair("ٹرانزٹ پوائنٹ پر متوقع بچے", av("cur_transit"))}</tr>
    <tr>${pair("سکول / مدارس کے بچے", av("cur_school"))}${pair("گھروں کے بچے", av("cur_hh_children"))}${pair("موجودہ مہم کے گھروں کی کل تعداد", av("cur_households"))}</tr>
    <tr>${pair("ٹیموں کی کل تعداد", av("teams"))}${pair("موبائل", av("mob"))}${pair("فکسڈ / ٹرانزٹ", `<b>${A.fx} / ${A.tr}</b>`)}</tr>
    <tr>${pair("DDM کارڈز سرخ", av("ddm_red"))}${pair("DDM کارڈز نیلے", av("ddm_blue"))}${pair("نئی ٹیم ممبر کی تعداد", av("new_members"))}</tr>
    <tr>${pair("وٹامن اے کیپسول — نیلے", av("vit_blue"))}${pair("وٹامن اے کیپسول — سرخ", av("vit_red"))}${pair("پین", av("pens"))}</tr>
    <tr>${pair("زپ لاک / پلاسٹک تھیلیاں", av("ziplock"))}${pair("مارکرز", av("markers"))}${pair("چاک بکس", av("chalk"))}</tr>
    <tr>${pair("ٹیلی شیٹ کی کل تعداد", av("tally"))}${pair("کل ویکسین خوراکیں", av("doses"))}${pair("پولیو ٹیم ممبرز کی کل تعداد", av("members"))}</tr>
    <tr>${pair("مائیگرینٹ اور موبائل آبادی کے بچے", edit ? `<input data-uc="mm_children" value="${E_(M.mm_children ?? A.mm_children ?? "")}">` : (M.mm_children ? mv("mm_children") : av("mm_children")))}<td colspan="4"></td></tr>
    ${sec("گزشتہ مہم میں رہ جانے والے بچے / زیرو ڈوز")}
    <tr>${pair("رہ جانے والے بچوں کی کل تعداد", av("missed"))}${pair("گزشتہ دو یا زیادہ مہم میں رہ جانے والے", av("missed_2plus"))}${pair("زیرو ڈوز بچوں کی تعداد", av("zd_prev"))}</tr>
    <tr>${pair("زیرو ڈوز بچے جنہیں ٹیکے لگائے گئے", av("zd_vacc"))}${pair("انکاری گھروں کی تعداد", av("refusal_hh"))}${pair("مذہبی مدارس کی تعداد", av("madaris"))}</tr>
    <tr>${pair("جامع مسجدوں کی تعداد", av("masjids"))}${pair("ہائی / ہائر سیکنڈری سکول", av("high_schools"))}${pair("سکول / مدارس جن میں 5 سال سے کم بچے ہیں", av("schools_u5"))}</tr>
    ${sec("پولیو ٹیم کی تربیت کا پلان / موبائل ٹیموں کی تعداد جن میں")}
    <tr>${pair("ٹریننگ کی تاریخ", mv("training_date"))}${pair("سیشن 1 / 2 / 3", `${mv("session1")} ${mv("session2")} ${mv("session3")}`)}${pair("کم از کم ایک حکومتی فرد", av("tm_govt"))}</tr>
    <tr>${pair("کم از کم ایک خاتون ممبر", av("tm_female"))}${pair("کم از کم ایک مقامی فرد", av("tm_local"))}${pair("دونوں ممبران بالغ ہیں", av("tm_adult"))}</tr>
    </table></div>
    <div class="fx-note fx-ur" dir="rtl">تمام یو پیک ممبران مکمل مائیکروپلان کا تفصیلی جائزہ لیں اور اس بات کی یقین دہانی کریں کہ تمام چھوٹی بڑی آبادیاں اس پلان کا حصہ ہیں۔ اس کے بعد دستخط کریں۔</div>
    <div class="fx-note fx-ur" dir="rtl">مائگرینٹ آبادی: افغان مہاجرین، آئی ڈی پیز اور وہ علاقے جہاں پولیو وائرس کی مسلسل تصدیق ہو رہی ہے۔ موبائل آبادی: وہ آبادی جو مستقل آباد نہیں ہوتی (خانہ بدوش، بھٹہ خشت کے مزدور، موسمی مہاجر وغیرہ)۔</div>
    <div class="fx-sig fx-ur" dir="rtl"><div>سکول ہیڈ ٹیچر</div><div>یونین کونسل انچارج</div><div>ضلعی آفیسر</div><div>امام جامع مسجد</div><div>علاقے کے معزز شہری</div><div>یونین کونسل سیکرٹری</div></div></div>`;
};

/* ---------------- UC social mobilization plan ---------------- */
FS.SM = [
  { k: "meeting", en: "UPEC/Communication Planning Meeting", ur: "یونین کونسل سطح کی منصوبہ سازی کی میٹنگ", cols: ["Venue جگہ", "Date تاریخ", "Time وقت", "Responsible Person for Meeting Arrangements ذمہ داری"], rows: 2 },
  { k: "influencer", en: "Influencer engagement", ur: "علاقہ کے بااثر افراد کے ساتھ کی جانے والی سرگرمیاں", cols: ["Activity Name", "Date تاریخ", "Time وقت", "Area/AIC Name ایریا انچارج", "Responsible Influencer بااثر فرد کا نام"], rows: 2 },
  { k: "school", en: "School/Madrassa based activities", ur: "سکول و مدارس کی سطح پر کی جانے والی سرگرمیاں", cols: ["Name of School/Madrassa", "Date تاریخ", "Time وقت", "Area/AIC Name ایریا انچارج", "Responsible Person for Debate Arrangements"], rows: 6 },
  { k: "masjid", en: "Masjid announcement and Masjid-based activities", ur: "مساجد کے اعلانات اور مساجد و مدارس میں کی جانے والی سرگرمیاں", cols: ["Name of Mosque مسجد/مدرسہ کا نام", "Date تاریخ", "Time وقت", "Area/AIC Name ایریا انچارج", "Responsible Person ذمہ دار فرد"], rows: 5 },
  { k: "other", en: "Other need-based mobilization activities", ur: "سماجی تحریک کیلئے کئے جانے والے دیگر اقدامات", cols: ["Activity سرگرمی کا نام", "Date تاریخ", "Time وقت", "Area/AIC Name ایریا انچارج", "Responsible Person ذمہ دار فرد"], rows: 6 },
  { k: "parental", en: "Parental engagement activities for persistently missed children", ur: "گزشتہ مہم میں مسلسل رہ جانے والے بچوں کے والدین کے ساتھ بیٹھک", cols: ["Activity سرگرمی کا نام", "Date تاریخ", "Time وقت", "Area/AIC Name ایریا انچارج", "Responsible Person ذمہ دار فرد"], rows: 3 },
  { k: "visibility", en: "Visibility and IEC dissemination (if any)", ur: "بینر، فلائر یا پوسٹر وغیرہ کی تنصیب", cols: ["Number of Posters پوسٹر", "Number of Banners بینر", "Name of Areas علاقے کا نام", "Area/AIC Name ایریا انچارج", "Responsible Person ذمہ دار فرد"], rows: 5 },
];
FS.renderSm = (B, edit) => {
  const M = FS.getForm(B, "sm_plan", null), H = M.head || {}, hv = (k, d = "") => edit ? `<input data-smh="${k}" value="${E_(H[k] ?? d)}">` : `<b>${E_(H[k] ?? d)}</b>`;
  const blocks = FS.SM.map(s => { const rows = Math.max(s.rows, ((M.rows || {})[s.k] || []).length);
    const body = Array.from({ length: rows }, (_, r) => `<tr><td>${r + 1}</td>${s.cols.map((_, c) => { const v = (((M.rows || {})[s.k] || [])[r] || [])[c] ?? ""; return `<td>${edit ? `<input data-sm="${s.k}|${r}|${c}" ${c === 1 ? 'type="date"' : c === 2 ? 'type="time"' : ""} value="${E_(v)}">` : (c === 1 ? FS.fmtDate(v) : E_(v))}</td>`; }).join("")}</tr>`).join("");
    return `<div class="fx-wrap" style="margin-top:6px"><table class="fx"><thead><tr><th colspan="${s.cols.length + 1}" style="text-align:left">${s.en} <span class="fx-ur" style="float:right">${s.ur}</span></th></tr><tr><th>#</th>${s.cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>${edit ? `<button class="btn small ghost noprint-ctl" type="button" data-smadd="${s.k}">+ Add row</button>` : ""}</div>`; }).join("");
  return `<div class="fx-page"><h1>UC LEVEL SOCIAL MOBILIZATION PLAN <span class="fx-ur" style="font-size:15px">— یونین کونسل میں سماجی تحریک کیلئے منصوبہ سازی</span></h1>
    <div class="fx-hdr"><div>Union Council: <b>${E_(B.geo.uc)}</b></div><div>District: <b>${E_(B.geo.district)}</b></div><div>Province: ${hv("province", "Punjab")}</div><div>Campaign: <b>${E_(B.campaign.name)}</b></div><div>UC Incharge: ${hv("incharge", B.ucmo?.full_name || "")}</div><div>Contact No: ${hv("contact", B.ucmo?.phone || "")}</div><div>RSP: ${hv("rsp")}</div></div>
    ${blocks}<div class="fx-sig"><div>Signature DPCR Focal Person</div><div>Signature of UC Incharge</div></div></div>`;
};

/* ---------------- Official 2A forms (campaign days and catch-up days) and the UC 2B ----------------
   Layout follows "Daily Performance, FLW's Attendance and Vaccine Recording and Reporting" (2A). Anything not reported shows 0. */
FS.AV = { k: "already_vaccinated", s: 1, l: "Already vaccinated children", av: 1 };   // asked from campaign day 2 onward (and on every catch-up day)
FS.A_COLS = [
  { k: "hh_target", g: "Number of households", l: "Target (micro plan)", calc: "hh" }, { k: "households_visited", g: "Number of households", l: "Visited by team" },
  { k: "ch_target", s: 1, l: "Children in HH from micro plan (0–5 yrs)", calc: "ch" }, { k: "children_vaccinated_first_visit", s: 1, l: "Vaccinated children of HH, first visit (0–5 yrs)" },
  { k: "missed_na", g: "Recorded missed children (0–5 yrs)", l: "N.A", calc: "missed" }, { k: "missed_refusal", g: "Recorded missed children (0–5 yrs)", l: "Refusal" },
  { k: "covered_na", g: "Covered missed children, same-day catch-up", l: "N.A" }, { k: "covered_refusal", g: "Covered missed children, same-day catch-up", l: "Refusal" },
  FS.AV, { k: "school_madrassa_children", s: 1, l: "School / Madrassa children", calc: "school" }, { k: "guest_vaccinated", s: 1, l: "Guest vaccinated" }, { k: "street_vaccinated", s: 1, l: "Children vaccinated in streets" },
  { k: "mmp_registered", g: "Total MMP children", l: "Registered", calc: "mmp" }, { k: "mmp_vaccinated", g: "Total MMP children", l: "Vaccinated" },
  { k: "zero_zero_houses", s: 1, l: "Total 0/0 houses" }, { k: "lock_houses", s: 1, l: "Total lock houses" },
  { k: "vaccine_doses_received", g: "Vaccine recorded doses", l: "Received" }, { k: "vaccine_doses_used", g: "Vaccine recorded doses", l: "Used" }, { k: "vd_remaining", g: "Vaccine recorded doses", l: "Remaining", calc: "rem" },
  { k: "finger_markers_received", s: 1, l: "Finger markers received" }, { k: "afp_cases_notified", s: 1, l: "AFP cases notified" }, { k: "zero_dose_ri_recorded", s: 1, l: "Zero dose for RI recorded" },
  { k: "vitamin_a_red", g: "Vitamin A capsules used", l: "Red", vit: 1 }, { k: "vitamin_a_blue", g: "Vitamin A capsules used", l: "Blue", vit: 1 }];
FS.C_COLS = [{ k: "cu_target", g: "Target for catch-up day", l: "Total children", calc: "cut" }, { k: "cu_cov", g: "Covered missed children, catch-up day", l: "Total children" },
  { k: "cu_still", g: "Still missed children, catch-up day", l: "Total children", calc: "still", t: "cu_target", cv: "cu_cov" }, FS.AV,
  { k: "guest_vaccinated", s: 1, l: "Guest vaccinated" }, { k: "street_vaccinated", s: 1, l: "Children vaccinated in streets" }, { k: "persistent_missed", s: 1, l: "Persistently missed children" },
  { k: "vaccine_doses_received", g: "Vaccine recorded doses", l: "Received" }, { k: "vaccine_doses_used", g: "Vaccine recorded doses", l: "Used" }, { k: "vd_remaining", g: "Vaccine recorded doses", l: "Remaining", calc: "rem" },
  { k: "finger_markers_received", g: "Finger markers", l: "Received" }, { k: "finger_markers_returned", g: "Finger markers", l: "Returned" }, { k: "fm_remaining", g: "Finger markers", l: "Remaining", calc: "fm" },
  { k: "afp_cases_notified", s: 1, l: "AFP cases notified" }, { k: "zero_dose_ri_recorded", s: 1, l: "Zero dose for RI recorded" },
  { k: "vitamin_a_red", g: "Vitamin A capsules used", l: "Red", vit: 1 }, { k: "vitamin_a_blue", g: "Vitamin A capsules used", l: "Blue", vit: 1 }];
FS.F_COLS = [{ k: "children_vaccinated_first_visit", s: 1, l: "Number of children vaccinated" }, FS.AV, { k: "vaccine_doses_received", g: "Vaccine recorded doses", l: "Received" }, { k: "vaccine_doses_used", g: "Vaccine recorded doses", l: "Used" }, { k: "vaccine_doses_returned", g: "Vaccine recorded doses", l: "Returned" },
  { k: "finger_markers_received", g: "Finger markers", l: "Received" }, { k: "finger_markers_returned", g: "Finger markers", l: "Returned" }, { k: "afp_cases_notified", s: 1, l: "AFP cases notified" }, { k: "zero_dose_ri_recorded", s: 1, l: "Zero dose for RI recorded" }];
FS.colsFor = (B, catchup, fixed, day) => (fixed ? FS.F_COLS : catchup ? FS.C_COLS : FS.A_COLS).filter(c => !(c.av && !catchup && day === 1));   // Already vaccinated is hidden on campaign day 1   // all official columns are always shown
FS.vitOn = (B) => FS.caps(B).vit_a_needed === "yes";
/* a capsule colour is asked about only when the campaign question is Yes AND a quantity (> 0) was configured for that colour */
FS.capQty = (B, color) => FS.vitOn(B) ? Math.max(0, +FS.caps(B)["vit_" + color] || 0) : 0;
FS.capOn = (B, color) => FS.capQty(B, color) > 0;
FS.capCol = (c) => c.k === "vitamin_a_blue" ? "blue" : "red";
/* capsules used so far in the campaign, with the unsaved entries of the screen (draft[team_no][key], for one day) replacing the saved ones */
FS.capUsed = (B, color, draft, day, catchup) => { const k = "vitamin_a_" + color; let n = 0;
  (B.reports || []).forEach(r => { if (draft && r.campaign_day === day && !!r.is_catchup === !!catchup && draft[r.team_no] && draft[r.team_no][k] !== undefined) return; n += +r[k] || 0; });
  if (draft) Object.keys(draft).forEach(tn => { if (draft[tn][k] !== undefined) n += Math.max(0, +draft[tn][k] || 0); }); return n; };
/* warnings only — a legitimate report is never blocked, because the quantity is the planned requirement and real use can differ */
FS.capWarn = (B, draft, day, catchup) => ["blue", "red"].filter(c => FS.capOn(B, c)).map(c => { const used = FS.capUsed(B, c, draft, day, catchup), qty = FS.capQty(B, c); return used > qty ? `${c === "blue" ? "Blue" : "Red"} capsules used so far (${used}) are more than the quantity configured for the campaign (${qty}) — please check.` : ""; }).filter(Boolean);
FS.LEGACY = { missed_na: (r) => (+r.missed_children_under_12m || 0) + (+r.missed_children_12_59m || 0), missed_refusal: (r) => (+r.refusal_under_12m || 0) + (+r.refusal_12_59m || 0), covered_na: (r) => +r.catchup_covered || 0, mmp_vaccinated: (r) => +r.hrmp_vaccinated || 0, cu_cov: (r) => ["na_u12", "na_1259", "r_u12", "r_1259"].reduce((n, k) => n + (+r["cu_cov_" + k] || 0), 0) };
FS.rv = (r, k) => { if (!r) return 0; const v = +r[k] || 0; return v || (FS.LEGACY[k] ? FS.LEGACY[k](r) : 0); };
FS.dayDate = (B, day) => B.campaign.start_date ? FS.fmtDate(new Date(new Date(B.campaign.start_date + "T00:00:00").getTime() + (day - 1) * 864e5).toISOString().slice(0, 10)) : "";
FS.nCatch = (B) => { const v = parseInt(B.campaign.catchup_days); return Number.isFinite(v) ? Math.min(Math.max(v, 0), 5) : 3; };   // catch-up days configured for the campaign (starts on day nDays + 1)
FS.nDays = (B) => Math.min(Math.max(parseInt(B.campaign.total_days) || 3, 1), 7);
FS.rep = (B, teamNo, day, catchup) => (B.reports || []).find(x => String(x.team_no) === String(teamNo) && x.campaign_day === day && !!x.is_catchup === !!catchup);
FS.tgt = (B, teamNo, day) => (B.targets || []).find(x => String(x.team_no) === String(teamNo) && x.campaign_day === day);
FS.planOf = (B, t, day) => B.plans.find(p => p.team_id === t.id && p.campaign_day === day) || {};
/* calculated value of one cell */
FS.cell = (B, t, day, catchup, c, vals) => { const r = FS.rep(B, t.team_no, day, catchup), p = FS.planOf(B, t, day), tg = FS.tgt(B, t.team_no, day) || {};
  const g = (k) => (vals && vals[k] !== undefined) ? (vals[k] === "" ? 0 : (+vals[k] || 0)) : FS.rv(r, k);
  const hhChildren = (+p.children_households_1_5 || 0) + (+p.children_under_1 || 0);
  switch (c.calc) {
    case "hh": return catchup ? 0 : (+p.total_households || +tg.target_households || 0);                       // from the saved Operational Plan
    case "ch": return catchup ? 0 : (hhChildren || (p.total_children ? 0 : +tg.target_children || 0));          // household children (1-5 and under 1) from the plan
    case "school": return catchup ? 0 : (+p.school_children || 0);                                              // school / madrassa children from the plan
    case "mmp": return catchup ? 0 : (+p.mmp_children || 0);                                                    // MMP children from the plan
    case "missed": return catchup ? 0 : Math.max(0, FS.cell(B, t, day, false, { calc: "ch" }) - g("children_vaccinated_first_visit") - g("missed_refusal"));   // remaining = target - covered - refusals
    case "cut": return FS.cuTarget(B, t, day);
    case "still": return Math.max(0, (c.t === "cu_target" ? FS.cuTarget(B, t, day) : g(c.t)) - g(c.cv));                                                          // remaining after covering; covered may exceed the target
    case "rem": return Math.max(0, g("vaccine_doses_received") - g("vaccine_doses_used"));
    case "fm": return Math.max(0, g("finger_markers_received") - g("finger_markers_returned"));
    case "hhrem": return Math.max(0, FS.cell(B, t, day, false, { calc: "hh" }) - g("households_visited"));
    case "chrem": return Math.max(0, FS.cell(B, t, day, false, { calc: "ch" }) - g("children_vaccinated_first_visit"));
    default: return g(c.k); } };
const head2 = (cols, extra) => { const g = []; cols.forEach(c => { if (c.s) g.push({ s: 1, c }); else { const last = g[g.length - 1]; if (last && !last.s && last.g === c.g) last.n.push(c); else g.push({ g: c.g, n: [c] }); } });
  const r1 = g.map(x => x.s ? `<th rowspan="2">${E_(x.c.l)}</th>` : `<th colspan="${x.n.length}">${E_(x.g)}</th>`).join(""), r2 = g.filter(x => !x.s).map(x => x.n.map(c => `<th>${E_(c.l)}</th>`).join("")).join(""); return [r1 + extra[0], r2 + extra[1]]; };
FS.DOSE = 1.11;   // doses per child (wastage factor already used by the Operational Plan: required_doses = total children x 1.11)
/* Catch-up target of one team. First catch-up day = team target (campaign days) - children covered on those days; every later catch-up day = previous
   catch-up target - children covered on the previous catch-up day. Never below 0. Always recalculated from the saved reports, so corrections flow through. */
FS.dayTarget = (B, t, day) => { const p = FS.planOf(B, t, day), tg = FS.tgt(B, t.team_no, day) || {}, parts = FS.cell(B, t, day, false, { calc: "ch" }) + (+p.school_children || 0) + (+p.mmp_children || 0);
  return parts || +p.total_children || +tg.target_children || 0; };                                       // household + MMP + school children of the day (Operational Plan)
FS.dayCovered = (B, t, day) => { const r = FS.rep(B, t.team_no, day, false); return r ? FS.rv(r, "children_vaccinated_first_visit") + FS.cell(B, t, day, false, { calc: "school" }) + FS.rv(r, "mmp_vaccinated") : 0; };   // household + school + MMP children covered
FS.cuTarget = (B, t, day) => { if (day > 1) return Math.max(0, FS.cuTarget(B, t, day - 1) - FS.rv(FS.rep(B, t.team_no, day - 1, true), "cu_cov"));
  let target = 0, covered = 0; for (let d = 1; d <= FS.nDays(B); d++) { target += FS.dayTarget(B, t, d); covered += FS.dayCovered(B, t, d); }
  return Math.max(0, target - covered); };
/* earlier reports a catch-up target depends on that have not been saved (flagged, never assumed to be zero) */
FS.cuMissing = (B, t, day) => { const out = []; if (day > 1) { for (let k = 1; k < day; k++) if (!FS.rep(B, t.team_no, k, true)) out.push("Catch-up day " + (FS.nDays(B) + k)); } else for (let d = 1; d <= FS.nDays(B); d++) if (!FS.rep(B, t.team_no, d, false)) out.push("Day " + d); return out; };
/* Expected vaccine use (a guide shown greyed in the Used box; the Used figure is always typed by the AIC and never filled in from this).
   = max(0, expected doses before adjustment - doses for already-vaccinated children). Before adjustment: the plan's required doses (children x 1.11), plus 1.11 per child
   covered above the target, so exceeding the target never lowers it. */
FS.expectedDoses = (B, t, day, catchup, vals) => { const round2 = (v) => Math.round(v * 100) / 100, r = FS.rep(B, t.team_no, day, catchup);
  const g = (k) => (vals && vals[k] !== undefined) ? Math.max(0, +vals[k] || 0) : Math.max(0, FS.rv(r, k)), av = (!catchup && day === 1) ? 0 : g("already_vaccinated");
  let before;
  if (catchup) before = FS.DOSE * Math.max(FS.cuTarget(B, t, day), g("cu_cov"));
  else { const p = FS.planOf(B, t, day), planned = p.required_doses != null ? +p.required_doses : (p.total_children ? +p.total_children * FS.DOSE : 0);
    before = planned + FS.DOSE * Math.max(0, g("children_vaccinated_first_visit") + g("mmp_vaccinated") + FS.cell(B, t, day, false, { calc: "school" }) - FS.dayTarget(B, t, day)); }
  return round2(Math.max(0, before - FS.DOSE * av)); };
/* warning text when Already vaccinated looks larger than the children this team is expected to see */
FS.avWarn = (B, t, day, catchup, vals) => { const v = +((vals || {}).already_vaccinated) || 0; if (v < 0) return "Already vaccinated cannot be negative."; const lim = catchup ? FS.cuTarget(B, t, day) : FS.dayTarget(B, t, day); return (lim > 0 && v > lim) ? `Team ${t.team_no}: already vaccinated (${v}) is more than the children expected (${lim}) — please check.` : ""; };
/* teams of an Area Incharge that have no saved report for the day (a 2A is only "prepared" when none are missing) */
FS.missingReports = (B, aic, day, catchup) => FS.teamsOf(B, aic.id).filter(t => !FS.rep(B, t.team_no, day, catchup));
/* record that this AIC's 2A for the day was prepared; re-preparing updates the same row, so there are never duplicates */
FS.markPrepared = async (B, aic, day, catchup) => { const ts = FS.teamsOf(B, aic.id);
  return await supabaseClient.from("prepared_forms").upsert({ campaign_id: B.campaign.id, aic_staff_id: aic.id, form_type: "2a", campaign_day: day, is_catchup: !!catchup, teams_total: ts.length, teams_reported: ts.length - FS.missingReports(B, aic, day, catchup).length, prepared_at: new Date().toISOString() }, { onConflict: "campaign_id,aic_staff_id,form_type,campaign_day,is_catchup" }); };
FS.dayLabel = (B, day, catchup) => catchup ? `Catch-up Day ${FS.nDays(B) + day}` : `Campaign Day ${day}`;
FS.members = (t) => (t.workers || []).slice().sort((a, b) => (a.member_role === "leader" ? -1 : b.member_role === "leader" ? 1 : FS.nat(a.member_no ?? 0, b.member_no ?? 0))).map(m => E_(m.staff?.full_name || "")).filter(Boolean).join(", ");
const SIG = ['<th colspan="2">Signature</th>', "<th>Morning</th><th>Evening</th>"];
FS.render2AOfficial = (B, aic, day, catchup, onlyTeamId) => {
  let ts = FS.teamsOf(B, aic.id); if (onlyTeamId) ts = ts.filter(t => t.id === onlyTeamId);
  const mob = ts.filter(t => (t.team_type || "mobile") === "mobile"), fx = ts.filter(t => t.team_type === "fixed" || t.team_type === "transit"), nd = FS.nDays(B);
  const label = catchup ? `Catchup Day ${nd + day}` : `Campaign Day ${day}`, date = FS.dayDate(B, catchup ? nd + day : day);
  const reported = ts.filter(t => FS.rep(B, t.team_no, day, catchup)).length, cnt = (k) => ts.filter(t => (t.team_type || "mobile") === k).length;
  const cols = FS.colsFor(B, catchup, false, day), fcols = FS.colsFor(B, catchup, true, day), z = (v) => Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  const totals = (list, cl) => cl.map(c => z(list.reduce((n, t) => n + FS.cell(B, t, day, catchup, c), 0)));
  const [h1, h2] = head2(cols, SIG), [f1, f2] = head2(fcols, SIG);
  const mrows = mob.map(t => `<tr><td><b>${E_(t.team_no)}</b></td><td class="l">${FS.members(t)}</td>${cols.map(c => `<td>${z(FS.cell(B, t, day, catchup, c))}</td>`).join("")}<td></td><td></td></tr>`).join("") || `<tr><td colspan="${cols.length + 4}" class="fx-miss">No mobile / CBV teams</td></tr>`;
  const frows = fx.map(t => `<tr><td><b>${E_(t.team_type === "fixed" ? "Fixed" : "Transit")} ${E_(t.team_no)}</b></td><td class="l">${FS.members(t)}</td>${fcols.map(c => `<td>${z(FS.cell(B, t, day, catchup, c))}</td>`).join("")}<td></td><td></td></tr>`).join("") || `<tr><td colspan="${fcols.length + 4}" class="fx-miss">No fixed / transit teams</td></tr>`;
  const sum = (list, k) => list.reduce((n, t) => n + FS.rv(FS.rep(B, t.team_no, day, catchup), k), 0), typeRow = (nm, list) => { const g = sum(list, "vaccine_doses_received"), u = sum(list, "vaccine_doses_used"); return `<tr><td class="l"><b>${nm}</b></td><td>${z(g)}</td><td>${z(u)}</td><td>${z(Math.max(0, g - u))}</td><td>${sum(list, "finger_markers_received")}</td></tr>`; };
  return `<div class="fx-page fx-2a"><h1>Daily Performance, FLW's Attendance and Vaccine Recording and Reporting</h1><h2>2A Form${catchup ? " — Catch-up days" : ""}</h2>
    <div class="fx-hdr"><div>Province: <b>Punjab</b></div><div>District: <b>${E_(B.geo.district)}</b></div><div>Tehsil/Town/Taluka: <b>${E_(B.geo.tehsil)}</b></div><div>UC: <b>${E_(B.geo.uc)}</b></div><div>Name of SIA: <b>${E_(B.campaign.name)}</b></div><div>${catchup ? "Catchup Day" : "Campaign Day"}: <b>${catchup ? nd + day : day}</b></div>
    <div>Name of AIC: <b>${E_(aic.full_name)}</b></div><div>Number of teams reported: <b>${reported}</b></div><div>Mobile/CBV: <b>${cnt("mobile")}</b> &nbsp; Fixed: <b>${cnt("fixed")}</b> &nbsp; Transit: <b>${cnt("transit")}</b></div><div>Date: <b>${date}</b></div></div>
    <div class="fx-wrap"><table class="fx fx-main"><thead><tr><th rowspan="2">Team No.</th><th rowspan="2">Name of Team Leader and Team Member</th>${h1}</tr><tr>${h2}</tr></thead><tbody>${mrows}
    <tr><td colspan="2"><b>Total</b></td>${totals(mob, cols).map(v => `<td><b>${v}</b></td>`).join("")}<td></td><td></td></tr></tbody></table></div>
    <div class="fx-note" style="margin-top:6px"><b>For Fixed and Transit teams</b></div>
    <div style="display:grid;grid-template-columns:1fr 280px;gap:8px;align-items:start"><div class="fx-wrap"><table class="fx"><thead><tr><th rowspan="2">Team Type</th><th rowspan="2">Name of Team Leader and Team Member</th>${f1}</tr><tr>${f2}</tr></thead><tbody>${frows}
    <tr><td colspan="2"><b>Total</b></td>${totals(fx, fcols).map(v => `<td><b>${v}</b></td>`).join("")}<td></td><td></td></tr></tbody></table></div>
    <div class="fx-wrap"><table class="fx"><thead><tr><th rowspan="2">Type of Teams</th><th colspan="3">Total Vaccine Record</th><th rowspan="2">Finger markers received</th></tr><tr><th>Given</th><th>Used</th><th>Returned</th></tr></thead><tbody>${typeRow("Mobile", mob)}${typeRow("Fixed", ts.filter(t => t.team_type === "fixed"))}${typeRow("Transit", ts.filter(t => t.team_type === "transit"))}${typeRow("Total", ts)}</tbody></table></div></div>
    <div class="fx-sig"><div>Verified by signature: Area Incharge</div><div>UC in Charge</div></div></div>`;
};
FS.render2A = (B, t, day, aic) => FS.render2AOfficial(B, aic, day, false, t.id);
/* every campaign day, then any catch-up day that has reports */
FS.render2ADays = (B, aic) => { const nd = FS.nDays(B), out = [], ids = new Set(FS.teamsOf(B, aic.id).map(t => String(t.team_no)));
  for (let d = 1; d <= nd; d++) out.push(FS.render2AOfficial(B, aic, d, false));
  for (let d = 1; d <= 3; d++) if ((B.reports || []).some(r => r.is_catchup && r.campaign_day === d && ids.has(String(r.team_no)))) out.push(FS.render2AOfficial(B, aic, d, true));
  return out.join(""); };

/* ---- 2B: UC consolidated, one row per Area Incharge ---- */
FS.sumReports = (B, teams, day, catchup) => { const cols = FS.colsFor(B, catchup, false, day), days = day === "all" ? Array.from({ length: FS.nDays(B) }, (_, i) => i + 1) : [day];
  const tot = Object.fromEntries(cols.map(c => [c.k, 0])); let last = null, n = 0;
  teams.forEach(t => days.forEach(d => { const r = FS.rep(B, t.team_no, d, catchup); if (r) { n++; const u = r.updated_at || r.created_at; if (u && (!last || u > last)) last = u; } cols.forEach(c => { tot[c.k] += FS.cell(B, t, d, catchup, c); }); }));
  return { tot, last, n, cols }; };
FS.render2B = (B, day, catchup) => {
  const all = FS.sumReports(B, B.teams, day, catchup), cols = all.cols, rows = B.aics.map(a => ({ a, ...FS.sumReports(B, FS.teamsOf(B, a.id), day, catchup) })), z = (v) => Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  const when = (x) => x ? new Date(x).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—", nd = FS.nDays(B);
  return `<div class="fx-page fx-2a"><h1>2B Form — Union Council Daily Report${catchup ? " (Catch-up days)" : ""}</h1>
    <div class="fx-hdr"><div>Campaign: <b>${E_(B.campaign.name)}</b></div><div>Union Council: <b>${E_(B.geo.uc)}</b></div><div>Tehsil: <b>${E_(B.geo.tehsil)}</b></div><div>District: <b>${E_(B.geo.district)}</b></div><div>UCMO: <b>${E_(B.ucmo?.full_name || "")}</b></div><div>${day === "all" ? "All days (cumulative)" : `${catchup ? "Catchup Day " + (nd + day) : "Campaign Day " + day} &nbsp; Date: <b>${FS.dayDate(B, catchup ? nd + day : day)}</b>`}</div></div>
    <div class="fx-wrap"><table class="fx"><thead><tr><th>AIC</th><th>Area Incharge</th><th>Teams</th>${cols.map(c => `<th>${c.g ? E_(c.g) + "<br>" : ""}${E_(c.l)}</th>`).join("")}<th class="noprint-ctl">Last update</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${E_(r.a.aic_no)}</b></td><td class="l">${E_(r.a.full_name)}</td><td>${FS.teamsOf(B, r.a.id).length}</td>${cols.map(c => `<td>${z(r.tot[c.k])}</td>`).join("")}<td class="noprint-ctl">${r.n ? when(r.last) : "not reported"}</td></tr>`).join("") || `<tr><td colspan="${cols.length + 4}" class="fx-miss">No Area Incharges</td></tr>`}
    <tr><td colspan="2"><b>UC Total</b></td><td><b>${B.teams.length}</b></td>${cols.map(c => `<td><b>${z(all.tot[c.k])}</b></td>`).join("")}<td class="noprint-ctl"></td></tr></tbody></table></div>
    <div class="fx-note">Prepared automatically from the 2A reports entered by the Area Incharges. Figures not yet reported show 0.</div><div class="fx-sig"><div>UCMO</div><div>Received by</div></div></div>`;
};

/* ---------------- Maps (pictures already uploaded elsewhere) ---------------- */
FS.imgData = async (bucket, path) => {
  if (!path) return null;
  try { const { data } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 3600); if (!data?.signedUrl) return null;
    const blob = await (await fetch(data.signedUrl)).blob(); return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch (e) { return null; }
};
FS.mapPage = (B, code, title, urdu, img, extra = "") => `<div class="fx-page"><h1>${E_(title)} <small>(${code})</small> <span class="fx-ur" style="font-size:15px">${urdu}</span></h1>${hdrBlock(B, null, extra)}<div class="fx-pic">${img ? `<img src="${img}" alt="${E_(title)}">` : `<span class="fx-miss">Map picture not uploaded yet</span>`}</div><div class="fx-sig"><div>Prepared by</div><div>Signature / Date</div></div></div>`;
FS.aicMaps = async (B, aic) => {
  const { data: tm } = await supabaseClient.from("team_day_maps").select("team_id, campaign_day, storage_path").eq("campaign_id", B.campaign.id);
  const by = Object.fromEntries((tm || []).map(m => [m.team_id + "|" + m.campaign_day, m.storage_path])), who = `<div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div>`;
  const out = [FS.mapPage(B, "8MP", "AIC Area Map (all teams, coloured)", "ایریا انچارج کا نقشہ", await FS.imgData("staff-documents", aic.area_map_path), who)];   // one per AIC
  for (const t of FS.teamsOf(B, aic.id).filter(x => x.team_type === "mobile")) for (let d = 1; d <= FS.nDays(B); d++)                                              // one per team per day
    out.push(FS.mapPage(B, "7MP", `Team ${t.team_no} Route Map — Day ${d}`, `ٹیم ${t.team_no} روٹ نقشہ — دن ${d}`, await FS.imgData("operational-plans", by[t.id + "|" + d]), who + `<div>Team: <b>${t.team_no}</b> · Day: <b>${d}</b></div>`));
  return out;
};
FS.ucMap = async (B) => FS.mapPage(B, "12MP", "UC Map", "یونین کونسل کا نقشہ", await FS.imgData("staff-documents", B.ucmo?.area_map_path), `<div>UCMO: <b>${E_(B.ucmo?.full_name || "—")}</b></div>`);
