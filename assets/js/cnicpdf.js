/* CNIC list PDF builder — A4 portrait, each CNIC drawn at the official card proportion (85.60 x 53.98 mm), enlarged 5%.
   Pure layout code: images come from getImage(path) -> {dataUrl, w, h} | null, so it can be tested without a browser.
   groups: [{ heading, teams: [{ heading|null, note|null, people: [{ name, father, cnic, cell, detail, frontPath, backPath }] }] }] */
const CARD_W_MM = 85.60, CARD_H_MM = 53.98, CARD_SCALE = 1.05;

function buildCnicPdf({ jsPDF, title, subtitle, groups, getImage, generatedOn }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297, M = 10, HEAD_BOTTOM = 26.5, FOOT_Y = 292, BOTTOM = 287;
  const FW = CARD_W_MM * CARD_SCALE, FH = CARD_H_MM * CARD_SCALE, GAP = 6;
  const FRAME_TOP = 19, BLOCK_H = FRAME_TOP + FH + 4;   // name, details, FRONT/BACK labels, frames, space
  const stats = { people: 0, withBoth: 0, missing: 0, pages: 1, blocks: [] };
  let y = HEAD_BOTTOM, curGroup = "", curTeam = "";

  const header = () => {
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20); doc.text(title, M, 11);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(70); doc.text(subtitle, M, 16);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20);
    const where = [curGroup, curTeam].filter(Boolean).join("   |   "); if (where) doc.text(where, M, 21.3, { maxWidth: PW - 2 * M });
    doc.setDrawColor(150).setLineWidth(0.3).line(M, 24, PW - M, 24);
  };
  const newPage = () => { doc.addPage(); stats.pages++; y = HEAD_BOTTOM; header(); };
  header();
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };

  const drawFrame = (x, yy, label, img) => {
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(90); doc.text(label, x, yy - 1);
    doc.setDrawColor(120).setLineWidth(0.25);
    if (!img) {
      doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(x, yy, FW, FH); doc.setLineDashPattern([], 0);
      doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(150); doc.text(`${label} picture not uploaded`, x + FW / 2, yy + FH / 2, { align: "center" });
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
      if (gH) { curGroup = g.heading; doc.setFillColor(40, 70, 60).rect(M, y, PW - 2 * M, 7.5, "F"); doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(255); doc.text(g.heading, M + 2, y + 5.2); doc.setTextColor(20); y += gH; groupDrawn = true; }
      if (t.heading) { doc.setFillColor(232, 239, 237).rect(M, y, PW - 2 * M, 6.5, "F"); doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20); doc.text(t.heading, M + 2, y + 4.6); y += barH; }
      if (t.note) { doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(120); doc.text(t.note, M + 2, y + 4); y += 6; }
      for (const p of t.people) {
        ensure(BLOCK_H);
        const top = y;
        doc.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(10); doc.text(p.name || "(name missing)", M, y + 4.5, { maxWidth: PW - 2 * M });
        doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(40);
        doc.text(`CNIC: ${p.cnic || "—"}      Mobile: ${p.cell || "—"}${p.father ? "      Father: " + p.father : ""}`, M, y + 10, { maxWidth: PW - 2 * M });
        if (p.detail) { doc.setFontSize(8.5).setTextColor(100); doc.text(p.detail, M, y + 14.0, { maxWidth: PW - 2 * M }); }
        const fy = y + FRAME_TOP;
        const a = drawFrame(M, fy, "FRONT", p.frontPath ? getImage(p.frontPath) : null);
        const b = drawFrame(M + FW + GAP, fy, "BACK", p.backPath ? getImage(p.backPath) : null);
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
if (typeof module !== "undefined") module.exports = { buildCnicPdf, CARD_W_MM, CARD_H_MM, CARD_SCALE };
