/** Fills a <select> with campaigns, most recent first. Returns the list. */
async function populateCampaignSelect(selectEl, { includeBlank = true } = {}) {
  const { data, error } = await supabaseClient
    .from("campaigns")
    .select("id, name, start_date")
    .order("start_date", { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  selectEl.innerHTML =
    (includeBlank ? `<option value="">Select a campaign…</option>` : "") +
    data.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  return data;
}

/** Finds or creates the district → tehsil → union_council chain, returns the UC id. */
async function ensureUnionCouncil(districtName, tehsilName, ucName) {
  districtName = districtName.trim();
  tehsilName = tehsilName.trim();
  ucName = ucName.trim();

  let { data: district } = await supabaseClient
    .from("districts").select("id").eq("name", districtName).maybeSingle();
  if (!district) {
    const { data, error } = await supabaseClient.from("districts").insert({ name: districtName }).select().single();
    if (error) throw error;
    district = data;
  }

  let { data: tehsil } = await supabaseClient
    .from("tehsils").select("id").eq("district_id", district.id).eq("name", tehsilName).maybeSingle();
  if (!tehsil) {
    const { data, error } = await supabaseClient
      .from("tehsils").insert({ district_id: district.id, name: tehsilName }).select().single();
    if (error) throw error;
    tehsil = data;
  }

  let { data: uc } = await supabaseClient
    .from("union_councils").select("id").eq("tehsil_id", tehsil.id).eq("name", ucName).maybeSingle();
  if (!uc) {
    const { data, error } = await supabaseClient
      .from("union_councils").insert({ tehsil_id: tehsil.id, name: ucName }).select().single();
    if (error) throw error;
    uc = data;
  }
  return uc.id;
}

/** Like ensureUnionCouncil, but also returns the district and tehsil ids
 *  (needed when setting up a district_coordinator profile). */
async function ensureGeographyIds(districtName, tehsilName, ucName) {
  districtName = districtName.trim();
  tehsilName = tehsilName.trim();
  ucName = ucName.trim();

  let { data: district } = await supabaseClient
    .from("districts").select("id").eq("name", districtName).maybeSingle();
  if (!district) {
    const { data, error } = await supabaseClient.from("districts").insert({ name: districtName }).select().single();
    if (error) throw error;
    district = data;
  }

  let { data: tehsil } = await supabaseClient
    .from("tehsils").select("id").eq("district_id", district.id).eq("name", tehsilName).maybeSingle();
  if (!tehsil) {
    const { data, error } = await supabaseClient
      .from("tehsils").insert({ district_id: district.id, name: tehsilName }).select().single();
    if (error) throw error;
    tehsil = data;
  }

  let { data: uc } = await supabaseClient
    .from("union_councils").select("id").eq("tehsil_id", tehsil.id).eq("name", ucName).maybeSingle();
  if (!uc) {
    const { data, error } = await supabaseClient
      .from("union_councils").insert({ tehsil_id: tehsil.id, name: ucName }).select().single();
    if (error) throw error;
    uc = data;
  }
  return { district_id: district.id, tehsil_id: tehsil.id, uc_id: uc.id };
}

function showFormError(el, error) {
  el.textContent = error?.message || String(error);
  el.style.display = "block";
}

function clearFormError(el) {
  el.textContent = "";
  el.style.display = "none";
}
