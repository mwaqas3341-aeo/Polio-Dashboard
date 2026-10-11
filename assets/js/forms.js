/* Shared engine for the 2026 supervision and UC-level formats.
   Data lives in campaign_forms (one row per campaign x form type x AIC); totals and scores are always calculated, never typed. */
const FS = {};
FS.esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const E_ = FS.esc;
FS.nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
FS.num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
FS.sum = (arr) => { const f = arr.map(FS.num).filter(v => v !== null); return f.length ? f.reduce((a, b) => a + b, 0) : null; };
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
  const { data: c } = await db.from("campaigns").select("id, name, status, uc_id, start_date, end_date, total_days, campaign_type").eq("id", campaignId).single(); B.campaign = c;
  B.geo = { uc: "", tehsil: "", district: "" };
  if (c.uc_id) { const { data: uc } = await db.from("union_councils").select("name, tehsils(name, districts(name))").eq("id", c.uc_id).single(); B.geo = { uc: uc?.name || "", tehsil: uc?.tehsils?.name || "", district: uc?.tehsils?.districts?.name || "" }; }
  let q = db.from("staff").select("id, full_name, aic_no, area_map_path, uc_id, phone, designation").eq("designation", "aic").eq("status", "active").order("aic_no"); if (c.uc_id) q = q.eq("uc_id", c.uc_id);
  B.aics = ((await q).data || []).sort((a, b) => FS.nat(a.aic_no, b.aic_no));
  const um = c.uc_id ? (await db.from("staff").select("id, full_name, phone, area_map_path").eq("designation", "ucmo").eq("uc_id", c.uc_id).eq("status", "active").limit(1)).data : []; B.ucmo = (um || [])[0] || null;
  const ids = B.aics.map(a => a.id), none = { data: [] };
  const tm = ids.length ? (await db.from("teams").select("id, team_no, team_type, aic_staff_id, team_members(active, member_no, staff(full_name))").in("aic_staff_id", ids)).data || [] : [];
  B.teams = tm.sort((a, b) => FS.nat(a.team_no, b.team_no)).map(t => ({ ...t, workers: (t.team_members || []).filter(m => m.active) }));
  const tids = B.teams.map(t => t.id);
  const r = await Promise.all([
    tids.length ? db.from("operational_plans").select("*").eq("campaign_id", campaignId).in("team_id", tids) : none,
    tids.length ? db.from("fixed_transit_plans").select("*").eq("campaign_id", campaignId).in("team_id", tids) : none,
    db.from("aic_microplan_figures").select("aic_staff_id, figures").eq("campaign_id", campaignId),
    db.from("campaign_forms").select("id, aic_staff_id, form_type, data").eq("campaign_id", campaignId),
    B.teams.length ? db.from("missed_children").select("team_no").eq("campaign_id", campaignId).not("carried_from_campaign_id", "is", null).in("team_no", B.teams.map(t => t.team_no)) : none,
  ]);
  B.plans = r[0].data || []; B.ft = r[1].data || []; B.figs = new Map((r[2].data || []).map(f => [f.aic_staff_id, f.figures || {}]));
  B.formsErr = r[3].error; (r[3].data || []).forEach(f => { B.forms[f.form_type + "|" + (f.aic_staff_id || "")] = f; }); B.missed = r[4].data || [];
  return B;
};
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

/* ---------------- Desk review ---------------- */
FS.renderDesk = (B, aic, edit) => {
  const ts = teamCols(B, aic); if (!ts.length) return empty(`AIC ${E_(aic.aic_no)} has no teams yet — Desk Review needs teams as columns.`);
  const D = FS.getForm(B, "desk_review", aic.id), A = D.answers || {};
  const val = (tn, i) => (A[tn] || {})[i] ?? "";
  const colTot = (t) => FS.score(FS.DESK_FLAT.map((_, i) => val(t.team_no, i)));
  return chunk(ts, 8).map((grp, gi, all) => {
    const last = gi === all.length - 1;
    const rows = FS.DESK_FLAT.map((r, i) => `<tr>${r.span ? `<td class="grp" rowspan="${r.span}">${E_(r.g)}</td>` : ""}<td>${i + 1}</td><td class="l">${E_(r.t)}</td>${grp.map(t => `<td>${edit ? `<select data-dr="${E_(t.team_no)}|${i}"><option value=""></option><option value="1" ${val(t.team_no, i) === "1" ? "selected" : ""}>1</option><option value="0" ${val(t.team_no, i) === "0" ? "selected" : ""}>0</option><option value="N" ${val(t.team_no, i) === "N" ? "selected" : ""}>N/A</option></select>` : (val(t.team_no, i) === "N" ? "N/A" : E_(val(t.team_no, i)))}</td>`).join("")}${last ? `<td><b>${FS.sum(ts.map(t => val(t.team_no, i) === "1" ? 1 : 0))}</b></td>` : ""}</tr>`).join("");
    const tot = grp.map(t => colTot(t));
    return `<div class="fx-page"><h1>Desk Review — Area Incharge</h1><h2>Polio Eradication Initiative</h2>
      <div class="fx-hdr"><div>Name of the Reviewer: ${edit ? `<input data-dh="reviewer" value="${E_(D.reviewer || "")}">` : `<b>${E_(D.reviewer || "")}</b>`}</div><div>District/Tehsil/UC: <b>${E_(B.geo.district)} / ${E_(B.geo.tehsil)} / ${E_(B.geo.uc)}</b></div>
      <div>Date of Review: ${edit ? `<input type="date" data-dh="date" value="${E_(D.date || "")}">` : `<b>${FS.fmtDate(D.date)}</b>`}</div><div>Campaign: <b>${E_(B.campaign.name)}</b></div><div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div><div>Total No of Teams: <b>${ts.length}</b></div></div>
      <div class="fx-note">Team / Area In charge / Union Council plan — Yes = 1, No = 0, N/A = Not Applicable. (Request Micro plans and Tally Sheets for previous activity for comparison.)</div>
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
  const get = (tn, i) => ((T[tn] || {}).a || {})[i] ?? "", day = (tn) => (T[tn] || {}).day ?? "";
  const sel = (key, cur, opts) => `<select ${key}><option value=""></option>${opts.map(o => `<option ${cur === o ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  return chunk(ts, 8).map((grp, gi, all) => {
    const last = gi === all.length - 1;
    const rows = FS.FV.map((t, i) => `<tr><td>${i + 1}</td><td class="l">${E_(t)}</td>${grp.map(tm => `<td>${edit ? sel(`data-fv="${E_(tm.team_no)}|${i}"`, get(tm.team_no, i), ["Yes", "No", "N/A"]) : E_(get(tm.team_no, i))}</td>`).join("")}</tr>`).join("");
    const sc = grp.map(tm => FS.score(FS.FV.map((_, i) => { const v = get(tm.team_no, i); return v === "Yes" ? "1" : v === "No" ? "0" : ""; })));
    return `<div class="fx-page"><h1>Field Validation of Microplan</h1><h2>Polio Eradication Initiative</h2>
      <div class="fx-hdr"><div>Province: <b>${edit ? `<input data-fh="province" value="${E_(D.province ?? "Punjab")}">` : E_(D.province ?? "Punjab")}</b></div><div>District/Town: <b>${E_(B.geo.district)}</b></div><div>Date of Campaign: <b>${FS.fmtDate(B.campaign.start_date)}</b></div>
      <div>Date of validation: ${edit ? `<input type="date" data-fh="date" value="${E_(D.date || "")}">` : `<b>${FS.fmtDate(D.date)}</b>`}</div><div>Name of validating person: ${edit ? `<input data-fh="person" value="${E_(D.person || "")}">` : `<b>${E_(D.person || "")}</b>`}</div><div>Designation: <b>AIC</b> &nbsp; Agency: <b>Govt</b></div>
      <div>Union Council: <b>${E_(B.geo.uc)}</b></div><div>Number of Teams: <b>${ts.length}</b> (Mobile ${cnt("mobile")}, Fixed ${cnt("fixed")}, Transit ${cnt("transit")})</div><div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div>
      <div>Validated by UC level supervisors? ${edit ? sel('data-fh="uc_val"', D.uc_val || "", ["Yes", "No"]) : `<b>${E_(D.uc_val || "")}</b>`}</div><div>By whom: ${edit ? sel('data-fh="by_whom"', D.by_whom || "", ["UCMO", "THO", "UCPO", "UCCO", "Any other"]) : `<b>${E_(D.by_whom || "")}</b>`}</div></div>
      <div class="fx-wrap"><table class="fx"><thead><tr><th>#</th><th>Field Validation Variables (tick appropriate)</th>${grp.map(tm => `<th>Team ${E_(tm.team_no)}<br>Day: ${edit ? `<select data-fvday="${E_(tm.team_no)}"><option value=""></option>${[1, 2, 3, 4, 5].map(d => `<option ${String(day(tm.team_no)) === String(d) ? "selected" : ""}>${d}</option>`).join("")}</select>` : E_(day(tm.team_no))}<br><small>Matching Yes / No</small></th>`).join("")}</tr></thead><tbody>${rows}
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
    missed: B.missed.length || null, missed_2plus: fs("missed_2plus"), zd_prev: fs("zd_prev"), zd_vacc: fs("zd_vacc"), refusal_hh: fs("refusal_hh"), madaris: fs("madaris"), masjids: fs("masjids"), high_schools: fs("high_schools"), schools_u5: fs("schools_u5"),
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
    <tr>${pair("وٹامن اے کیپسول", av("vit_a"))}${pair("پین", av("pens"))}${pair("زپ لاک / پلاسٹک تھیلیاں", av("ziplock"))}</tr>
    <tr>${pair("مارکرز", av("markers"))}${pair("چاک بکس", av("chalk"))}${pair("ٹیلی شیٹ کی کل تعداد", av("tally"))}</tr>
    <tr>${pair("کل ویکسین خوراکیں", av("doses"))}${pair("مائیگرینٹ اور موبائل آبادی کے بچے", mv("mm_children"))}${pair("پولیو ٹیم ممبرز کی کل تعداد", av("members"))}</tr>
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

/* ---------------- Maps (pictures already uploaded elsewhere) ---------------- */
FS.imgData = async (bucket, path) => {
  if (!path) return null;
  try { const { data } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 3600); if (!data?.signedUrl) return null;
    const blob = await (await fetch(data.signedUrl)).blob(); return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch (e) { return null; }
};
FS.mapPage = (B, code, title, urdu, img, extra = "") => `<div class="fx-page"><h1>${E_(title)} <small>(${code})</small> <span class="fx-ur" style="font-size:15px">${urdu}</span></h1>${hdrBlock(B, null, extra)}<div class="fx-pic">${img ? `<img src="${img}" alt="${E_(title)}">` : `<span class="fx-miss">Map picture not uploaded yet</span>`}</div><div class="fx-sig"><div>Prepared by</div><div>Signature / Date</div></div></div>`;
FS.aicMaps = async (B, aic) => {
  const { data: dm } = await supabaseClient.from("operational_day_maps").select("campaign_day, storage_path").eq("campaign_id", B.campaign.id).eq("aic_staff_id", aic.id);
  const by = Object.fromEntries((dm || []).map(m => [m.campaign_day, m.storage_path])), who = `<div>Area Incharge: <b>AIC ${E_(aic.aic_no)} — ${E_(aic.full_name)}</b></div>`;
  const out = [FS.mapPage(B, "8MP", "AIC Area Map (all teams, coloured)", "ایریا انچارج کا نقشہ", await FS.imgData("staff-documents", aic.area_map_path), who)];
  for (const d of [1, 2, 3]) out.push(FS.mapPage(B, "7MP", `Route Map — Day ${d}`, `ٹیم روٹ نقشہ — دن ${d}`, await FS.imgData("operational-plans", by[d]), who + `<div>Day: <b>${d}</b></div>`));
  return out;
};
FS.ucMap = async (B) => FS.mapPage(B, "12MP", "UC Map", "یونین کونسل کا نقشہ", await FS.imgData("staff-documents", B.ucmo?.area_map_path), `<div>UCMO: <b>${E_(B.ucmo?.full_name || "—")}</b></div>`);
