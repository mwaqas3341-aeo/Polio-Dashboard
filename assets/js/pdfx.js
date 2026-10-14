/* PDFX — the one place where PDFs are created, checked, previewed and downloaded.

   Why this exists: every html2pdf export used to put its hidden copy of the form in a box styled
   "position:fixed; left:-99999px". html2pdf copies that inline style onto its own clone, so the page it
   photographs is 99,999 px off-screen and the PDF came out completely blank. PDFX.fromPages() builds the box
   WITHOUT any positioning, waits for fonts, and refuses to hand back a PDF whose first page is blank.

   Public API
     PDFX.fromPages(pages, {landscape})      html pages (strings) -> Promise<ArrayBuffer>  (landscape: "auto" (default) = 2A/2B/microplan landscape, rest portrait; throws PDFX.NoData when empty)
     PDFX.verify(bytes)                      Promise<{pages}>  throws when the first page is blank / file is unreadable
     PDFX.save(bytes, filename)              download the bytes
     PDFX.download({filename, makeBytes, say})   generate -> verify -> save   (say(text, isError) shows messages)
     PDFX.preview({title, filename, makeBytes})  modal: generate -> verify -> show every page -> Download button (same bytes)
     PDFX.textImage(str, opts)               canvas rendering of Urdu / non-Latin text for jsPDF documents                  */
const PDFX = (() => {
  const CFG = { pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", worker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js" };
  class NoData extends Error { constructor(m) { super(m || "There is nothing to put in this PDF yet."); this.name = "NoData"; } }
  const FONT = '"Jameel Noori Nastaleeq","Noto Nastaliq Urdu","Noto Naskh Arabic","Segoe UI",Tahoma,Arial,sans-serif';

  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Could not load the PDF viewer library. Check your internet connection and reload.")); document.head.appendChild(s); });
  let libP = null;
  const pdfjs = () => libP || (libP = (window.pdfjsLib ? Promise.resolve() : loadScript(CFG.pdfjs)).then(() => { if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = CFG.worker; return pdfjsLib; }).catch(e => { libP = null; throw e; }));

  /* ---------- html pages -> PDF ---------- */
  // Landscape: microplan sheets, 2A and 2B.  Everything else (maps, UC / supervision / social-mobilization forms, lists) is portrait.
  const isLandscape = (h) => /fx-2a|class=["']sheet[ "']|data-landscape/.test(String(h));
  let libL = null;
  const pdfLib = () => libL || (libL = (window.PDFLib ? Promise.resolve() : loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js")).then(() => window.PDFLib).catch(e => { libL = null; throw e; }));
  async function buildRun(pages, landscape) {
    const W = landscape ? 1100 : 771;                              // printable width of A4 (297 / 210 mm minus 3 mm margins) at 96 dpi, so 12pt prints as 12pt
    const box = document.createElement("div");
    box.className = "pdf-std"; box.style.cssText = "width:" + W + "px;background:#fff;";   // NO position / left / top here — see the note at the top of this file
    pages.forEach((h, i) => { const d = document.createElement("div"); d.className = "pdf-pg"; d.style.cssText = i ? "break-before:page;" : ""; d.innerHTML = h; box.appendChild(d); });
    document.body.appendChild(box);
    try {
      const imgs = [...box.querySelectorAll("img")];                 // images must be decoded before the page is photographed
      await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      return await html2pdf().set({ margin: [3, 3, 3, 3], image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, width: W, windowWidth: W, x: 0, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" }, pagebreak: { mode: ["css", "avoid-all"], avoid: ["tr", ".fx-team"] } }).from(box).outputPdf("arraybuffer");
    } finally { box.remove(); }
  }
  /* pages: html strings. opts.landscape: true / false forces one orientation; default "auto" picks it per page and joins the runs into one PDF. */
  async function fromPages(pages, { landscape = "auto" } = {}) {
    pages = (pages || []).filter(h => h && String(h).trim());
    if (!pages.length) throw new NoData();
    if (!window.html2pdf) throw new Error("The PDF library did not load. Check your internet connection and reload the page.");
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const runs = [];                                                  // consecutive pages with the same orientation
    pages.forEach(h => { const l = landscape === "auto" ? isLandscape(h) : !!landscape, last = runs[runs.length - 1]; if (last && last.l === l) last.pages.push(h); else runs.push({ l, pages: [h] }); });
    if (runs.length === 1) return await buildRun(runs[0].pages, runs[0].l);
    const lib = await pdfLib(), out = await lib.PDFDocument.create();
    for (const r of runs) { const src = await lib.PDFDocument.load(await buildRun(r.pages, r.l)), pgs = await out.copyPages(src, src.getPageIndices()); pgs.forEach(p => out.addPage(p)); }
    return (await out.save()).buffer;
  }

  /* ---------- checking ---------- */
  const inkOf = (canvas) => { const c = canvas.getContext("2d"), d = c.getImageData(0, 0, canvas.width, canvas.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++; return n; };
  async function open(bytes) { const lib = await pdfjs(); return await lib.getDocument({ data: bytes.slice(0) }).promise; }
  async function renderPage(pdf, n, targetPx, canvas) {
    const page = await pdf.getPage(n), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: targetPx / v1.width });
    canvas = canvas || document.createElement("canvas"); canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise; return canvas;
  }
  async function verify(bytes) {
    if (!bytes || !bytes.byteLength) throw new Error("The PDF is empty (0 bytes).");
    let pdf; try { pdf = await open(bytes); } catch (e) { throw new Error("The PDF file could not be read back: " + (e.message || e)); }
    if (!pdf.numPages) throw new Error("The PDF has no pages.");
    const c = await renderPage(pdf, 1, 400);
    if (inkOf(c) < 40) throw new Error("The PDF came out blank, so nothing was downloaded. Please reload the page and try again; if it happens again tell the administrator.");
    return { pages: pdf.numPages, pdf };
  }

  /* ---------- saving ---------- */
  function save(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), a = document.createElement("a");
    a.href = url; a.download = String(filename || "document.pdf").replace(/[^\w\u0600-\u06FF.\-]+/g, "_").replace(/(\.pdf)?$/i, ".pdf"); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function download({ filename, makeBytes, say = () => {} }) {
    try { say("Preparing the PDF…"); const bytes = await makeBytes(); say("Checking the PDF…"); const v = await verify(bytes); save(bytes, filename); say(`Done — ${v.pages} page(s) downloaded.`); return true; }
    catch (e) { if (!(e instanceof NoData)) console.error(e); say(e instanceof NoData ? e.message : "Could not create the PDF: " + (e.message || e), true); return false; }
  }

  /* ---------- preview modal (shows the real PDF pages; Download saves the very same bytes) ---------- */
  let css = false;
  function addCss() {
    if (css) return; css = true; const s = document.createElement("style");
    s.textContent = `.pvx{position:fixed;inset:0;z-index:100000;background:rgba(20,25,24,.82);display:flex;flex-direction:column}
      .pvx-bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;padding:.5rem .7rem;background:#fff;border-bottom:1px solid #ccc}
      .pvx-bar b{flex:1 1 140px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pvx-bar button{padding:.45rem .9rem;border-radius:8px;border:1px solid #1a7f5a;background:#1a7f5a;color:#fff;font:inherit;cursor:pointer}
      .pvx-bar button.g{background:#fff;color:#222;border-color:#bbb} .pvx-bar button:disabled{opacity:.45;cursor:default}
      .pvx-body{flex:1;overflow:auto;padding:.7rem;-webkit-overflow-scrolling:touch} .pvx-msg{max-width:640px;margin:2rem auto;background:#fff;border-radius:10px;padding:1rem 1.2rem;text-align:center}
      .pvx-msg.err{border:2px solid #c0392b;color:#8e2417} .pvx-pg{margin:0 auto .7rem;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.35);min-height:120px}
      .pvx-pg canvas{display:block;width:100%;height:auto} .pvx-note{color:#fff;text-align:center;font-size:.8rem;margin:.2rem 0 .6rem}`;
    document.head.appendChild(s);
  }
  async function preview({ title, filename, makeBytes }) {
    addCss(); const root = document.createElement("div"); root.className = "pvx";
    root.innerHTML = `<div class="pvx-bar"><b></b><button class="g" data-z="-">−</button><button class="g" data-z="+">+</button><button data-a="dl" disabled>Download PDF</button><button class="g" data-a="x">Close</button></div><div class="pvx-body"></div>`;
    root.querySelector("b").textContent = title || "Preview"; document.body.appendChild(root); document.body.style.overflow = "hidden";
    const body = root.querySelector(".pvx-body"), dl = root.querySelector('[data-a="dl"]'); let bytes = null, zoom = 1, io = null;
    const close = () => { io && io.disconnect(); root.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", esc); }, esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc); root.querySelector('[data-a="x"]').onclick = close;
    const msg = (t, err) => { body.innerHTML = `<div class="pvx-msg${err ? " err" : ""}"></div>`; body.firstChild.textContent = t; };
    dl.onclick = () => { if (bytes) save(bytes, filename); };
    const setZoom = (z) => { zoom = Math.max(1, Math.min(3, z)); body.querySelectorAll(".pvx-pg").forEach(p => p.style.width = (zoom * 100) + "%"); };
    root.querySelector('[data-z="+"]').onclick = () => setZoom(zoom + 0.5); root.querySelector('[data-z="-"]').onclick = () => setZoom(zoom - 0.5);
    try {
      msg("Preparing the document…"); bytes = await makeBytes(); msg("Checking the document…");
      const v = await verify(bytes), pdf = v.pdf, first = await pdf.getPage(1), landscape = first.getViewport({ scale: 1 }).width > first.getViewport({ scale: 1 }).height, px = landscape ? 1500 : 1100;
      body.innerHTML = `<div class="pvx-note">${v.pages} page(s) — this is the exact file that will be downloaded</div>`;
      const slots = []; for (let n = 1; n <= v.pages; n++) { const d = document.createElement("div"); d.className = "pvx-pg"; d.dataset.n = n; d.style.maxWidth = landscape ? "1400px" : "820px"; body.appendChild(d); slots.push(d); }
      io = new IntersectionObserver(es => es.forEach(async en => { if (!en.isIntersecting || en.target.dataset.done) return; en.target.dataset.done = 1; try { const c = await renderPage(pdf, +en.target.dataset.n, px); en.target.innerHTML = ""; en.target.appendChild(c); } catch (e) { en.target.textContent = "This page could not be shown: " + (e.message || e); } }), { root: body, rootMargin: "600px 0px" });
      slots.forEach(s => io.observe(s)); dl.disabled = false;
    } catch (e) { if (!(e instanceof NoData)) console.error(e); msg(e instanceof NoData ? e.message : "Could not create the document: " + (e.message || e), !(e instanceof NoData)); }
  }

  /* ---------- Urdu / non-Latin text for jsPDF (its built-in fonts cannot draw it) ---------- */
  function textImage(str, { bold = false, pt = 10, maxMm = 180, color = "#141414" } = {}) {
    try {
      const S = 22.68;                                                    // canvas pixels per millimetre of the PDF page
      const fontPx = Math.round(pt * 0.3528 * S), font = `${bold ? "bold " : ""}${fontPx}px ${FONT}`;
      const c = document.createElement("canvas"), g = c.getContext("2d"); g.font = font;
      const w = Math.max(10, Math.min(Math.ceil(g.measureText(str).width) + 8, Math.round(maxMm * S))), h = Math.round(fontPx * 1.7);
      c.width = w; c.height = h;                                           // resizing a canvas resets its context, so the font is set again below
      g.font = font; g.fillStyle = color; g.textBaseline = "middle"; g.fillText(str, 4, h / 2, w - 8);
      return { dataUrl: c.toDataURL("image/png"), wMm: w / S, hMm: h / S };
    } catch (e) { return null; }
  }
  return { CFG, NoData, fromPages, verify, save, download, preview, textImage, _renderPage: renderPage, _open: open };
})();
if (typeof module !== "undefined") module.exports = PDFX;
