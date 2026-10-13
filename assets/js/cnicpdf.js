/* CNIC list PDF builder — A4 portrait, each CNIC drawn at the official card proportion (85.60 x 53.98 mm), enlarged 5%.
   Pure layout code: images come from getImage(path) -> {dataUrl, w, h} | null, so it can be tested without a browser.
   groups: [{ heading, teams: [{ heading|null, note|null, people: [{ name, father, cnic, cell, detail, frontPath, backPath }] }] }] */
const CARD_W_MM = 85.60, CARD_H_MM = 53.98, CARD_SCALE = 1.05;

function buildCnicPdf({ jsPDF, title, subtitle, groups, getImage, generatedOn, textImage, failedPaths }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  // jsPDF's built-in fonts cannot draw Urdu / other non-Latin letters (they come out blank or garbled). When the caller supplies
  // textImage(str, {bold, pt, maxMm, color}) -> {dataUrl, wMm, hMm}, such text is drawn as a picture instead.
  const NONLATIN = /[^\u0000-\u00FF]/;
  const put = (str, x, yy, o = {}) => {
    str = String(str ?? "");
    if (textImage && NONLATIN.test(str)) {
      const im = textImage(str, { bold: o.bold, pt: o.pt || 10, maxMm: o.maxWidth || 180, color: o.color || "#141414" });
      if (im) { doc.addImage(im.dataUrl, "PNG", x, yy - im.hMm * 0.72, im.wMm, im.hMm, undefined, "FAST"); return; }
    }
    const { bold, pt, color, ...rest } = o; doc.text(str, x, yy, rest);
  };
  const PW = 210, PH = 297, M = 10, HEAD_BOTTOM = 25.5, FOOT_Y = 293, BOTTOM = 289.5;
  const FW = CARD_W_MM * CARD_SCALE, FH = CARD_H_MM * CARD_SCALE, GAP = 6;
  const FRAME_TOP = 7.5, BLOCK_H = FRAME_TOP + FH + 1.6;   // bold name / cell line, frames, small gap -> 4 CNICs per page
  const stats = { people: 0, withBoth: 0, missing: 0, pages: 1, blocks: [] };
  let y = HEAD_BOTTOM, curGroup = "", curTeam = "";

  const header = () => {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20); put(title, M, 11, { bold: true, pt: 14, maxWidth: PW - 2 * M });
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(70); put(subtitle, M, 16, { pt: 9, maxWidth: PW - 2 * M, color: "#464646" });
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20);
    const where = [curGroup, curTeam].filter(Boolean).join("   |   "); if (where) put(where, M, 21.3, { bold: true, pt: 10, maxWidth: PW - 2 * M });
    doc.setDrawColor(150).setLineWidth(0.3).line(M, 24, PW - M, 24);
  };
  const newPage = () => { doc.addPage(); stats.pages++; y = HEAD_BOTTOM; header(); };
  header();
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };

  const drawFrame = (x, yy, label, img, caption, path) => {
    doc.setFont("helvetica", "bold").setFontSize(12.5).setTextColor(10); put(String(caption || ""), x, yy - 1.8, { bold: true, pt: 12.5, maxWidth: FW });   // bold line above the picture: name over the front, cell number over the back
    doc.setDrawColor(120).setLineWidth(0.25);
    if (!img) {
      doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(x, yy, FW, FH); doc.setLineDashPattern([], 0);
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(150); doc.text((path && failedPaths && failedPaths.has(path)) ? `${label} picture could not be loaded` : `${label} picture not uploaded`, x + FW / 2, yy + FH / 2, { align: "center" });
      return false;
    }
    doc.rect(x, yy, FW, FH);                                   // the official card outline
    const s = Math.min(FW / img.w, FH / img.h), w = img.w * s, h = img.h * s;   // keep the picture's own proportions
    doc.addImage(img.dataUrl, "JPEG", x + (FW - w) / 2, yy + (FH - h) / 2, w, h, undefined, "FAST");
    return true;
  };

  for (const g of groups) {
    curGroup = g.heading || ""; curTeam = "";
    let groupDrawn = false;
    for (const t of g.teams) {
      curTeam = t.heading || "";
      const barH = t.heading ? 8 : 0, gH = groupDrawn || !g.heading ? 0 : 10;
      ensure(gH + barH + (t.people.length ? BLOCK_H : 6));   // headings never sit alone at the bottom of a page
      if (gH) { curGroup = g.heading; doc.setFillColor(40, 70, 60).rect(M, y, PW - 2 * M, 7.5, "F"); doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(255); put(g.heading, M + 2, y + 5.2, { bold: true, pt: 11, color: "#ffffff", maxWidth: PW - 2 * M - 4 }); doc.setTextColor(20); y += gH; groupDrawn = true; }
      if (t.heading) { doc.setFillColor(232, 239, 237).rect(M, y, PW - 2 * M, 6.5, "F"); doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20); put(t.heading, M + 2, y + 4.6, { bold: true, pt: 10, maxWidth: PW - 2 * M - 4 }); y += barH; }
      if (t.note) { doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(120); put(t.note, M + 2, y + 4, { pt: 9, color: "#787878", maxWidth: PW - 2 * M - 4 }); y += 6; }
      for (const p of t.people) {
        ensure(BLOCK_H);
        const top = y;
        const fy = y + FRAME_TOP;
        const a = drawFrame(M, fy, "FRONT", p.frontPath ? getImage(p.frontPath) : null, p.name || "(name missing)", p.frontPath);
        const b = drawFrame(M + FW + GAP, fy, "BACK", p.backPath ? getImage(p.backPath) : null, p.cell || "(cell no. missing)", p.backPath);
        stats.people++; if (a && b) stats.withBoth++; else stats.missing++;
        stats.blocks.push({ page: doc.getCurrentPageInfo ? doc.getCurrentPageInfo().pageNumber : stats.pages, top, bottom: fy + FH, name: p.name });
        y = top + BLOCK_H;
      }
      y += 2;
    }
  }
  const n = doc.getNumberOfPages(); stats.pages = n;
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(110);
    doc.text(`${generatedOn || ""}`, M, FOOT_Y); doc.text(`Page ${i} of ${n}`, PW - M, FOOT_Y, { align: "right" }); }
  return { doc, stats, frame: { w: FW, h: FH } };
}

/* CnicImages — shared picture loader for every CNIC PDF. Signed URL -> bytes -> decoded -> downscaled JPEG.
   Old loader swallowed every failure (and a rejected createImageBitmap option on some browsers) and the PDF then said
   "picture not uploaded" even though the file was in storage. This one retries, has an <img> decoder fallback, and records WHY a picture failed. */
const CnicImages = (() => {
  async function decode(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch (e) {}
      try { return await createImageBitmap(blob); } catch (e) {}
    }
    const url = URL.createObjectURL(blob);
    try { const im = new Image(); im.decoding = "async"; im.src = url; await im.decode(); return im; }
    finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
  async function loadOne(client, path) {
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await client.storage.from("staff-documents").createSignedUrl(path, 600);
        if (error || !data?.signedUrl) throw new Error("access refused / file not found (" + (error?.message || "no URL") + ")");
        const res = await fetch(data.signedUrl); if (!res.ok) throw new Error("download failed, HTTP " + res.status);
        const blob = await res.blob(); if (!blob.size) throw new Error("the stored file is empty");
        const bmp = await decode(blob), w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight; if (!w0 || !h0) throw new Error("the file is not a readable picture");
        const k = Math.min(1, 1500 / Math.max(w0, h0)), c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
        return { dataUrl: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height };
      } catch (e) { last = e; }
    }
    throw last;
  }
  /* -> { cache: Map(path -> image|null), failed: [{path, reason}] } */
  async function preload(client, paths, onTick) {
    const cache = new Map(), failed = []; let done = 0, i = 0;
    const worker = async () => { while (i < paths.length) { const p = paths[i++]; try { cache.set(p, await loadOne(client, p)); } catch (e) { cache.set(p, null); failed.push({ path: p, reason: e.message || String(e) }); } onTick && onTick(++done, paths.length); } };
    await Promise.all([worker(), worker(), worker(), worker()]); return { cache, failed };
  }
  return { preload, loadOne };
})();
if (typeof module !== "undefined") module.exports = { buildCnicPdf, CARD_W_MM, CARD_H_MM, CARD_SCALE };
