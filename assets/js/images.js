/* Picture helpers: validate + shrink phone photos before upload (keeps mobile data use small). */
const IMG_MAX_ORIGINAL = 15 * 1024 * 1024;
async function compressImage(file, maxDim = 1600, quality = 0.8) {
  if (!file) throw new Error("No picture chosen");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Only JPG, PNG or WebP pictures are allowed (iPhone HEIC: choose “Most Compatible” in camera settings or share as JPG)");
  if (file.size > IMG_MAX_ORIGINAL) throw new Error("The picture is larger than 15 MB — please use a smaller photo");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("The picture could not be read")); i.src = url; });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const web = file.type === "image/webp";
    if (scale === 1 && file.size < 400 * 1024 && !web) return file;                      // already small
    const canvas = document.createElement("canvas"); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || (blob.size >= file.size && !web)) return file;                            // never make it bigger
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}
const fileExt = (f) => (f.type === "image/png" ? "png" : "jpg");

/* ---------- Rotate pictures (maps, CNIC pictures): before upload and after upload ---------- */
const ImgTools = (() => {
  const load = (blob) => new Promise((res, rej) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(u), 3000); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("The picture could not be read")); }; i.src = u; });
  /* turn a picture 90 degrees (deg = 90 clockwise, -90 anticlockwise, 180). Keeps PNG as PNG, everything else becomes JPEG; full resolution is kept. */
  async function rotateBlob(blob, deg = 90) {
    const img = await load(blob), w = img.naturalWidth, h = img.naturalHeight, q = ((deg % 360) + 360) % 360, swap = q === 90 || q === 270;
    const c = document.createElement("canvas"); c.width = swap ? h : w; c.height = swap ? w : h;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.translate(c.width / 2, c.height / 2); g.rotate(q * Math.PI / 180); g.drawImage(img, -w / 2, -h / 2);
    const png = blob.type === "image/png", out = await new Promise(r => c.toBlob(r, png ? "image/png" : "image/jpeg", 0.92)); if (!out) throw new Error("The picture could not be rotated");
    return out;
  }
  /* input[type=file] that already holds a chosen picture: rotate it in place (the form then uploads the rotated file on Save) */
  async function rotateInput(input, deg = 90) {
    const f = input.files && input.files[0]; if (!f) throw new Error("Choose a picture first");
    const b = await rotateBlob(f, deg), nf = new File([b], f.name, { type: b.type }), dt = new DataTransfer(); dt.items.add(nf); input.files = dt.files; return nf;
  }
  /* a picture that is already stored: download, rotate, put it back at the same path (same file type) */
  async function rotateStored(client, bucket, path, deg = 90) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 120); if (error || !data?.signedUrl) throw new Error("Could not open the stored picture");
    const res = await fetch(data.signedUrl); if (!res.ok) throw new Error("Could not download the stored picture (HTTP " + res.status + ")");
    let blob = await res.blob(); const png = /\.png$/i.test(path); if (blob.type !== (png ? "image/png" : "image/jpeg")) blob = new Blob([blob], { type: png ? "image/png" : "image/jpeg" });
    const out = await rotateBlob(blob, deg), up = await client.storage.from(bucket).upload(path, out, { upsert: true, contentType: out.type }); if (up.error) throw up.error;
    return out;
  }
  const signed = async (client, bucket, path) => { const { data } = await client.storage.from(bucket).createSignedUrl(path, 600); return data?.signedUrl || null; };
  /* Puts an <img> inside a frame of the same proportions and fit it has in the PDF, so the user sees exactly how the picture will print:
     "cnic" = one CNIC card (85.6 x 54 mm, picture kept whole, white margins), "map" = the map area of the portrait PDF page (190 x 225 mm). Safe to call twice. */
  const FRAMES = { cnic: { ar: "85.6 / 54", maxw: "360px", note: "As it will appear in the PDF (CNIC card 85.6 × 54 mm)" }, map: { ar: "190 / 225", maxw: "420px", note: "As it will appear in the PDF (map area of the page)" } };
  function previewBox(img, kind) {
    const F = FRAMES[kind]; if (!img || !F) return img; if (img.dataset.pbox) return img; img.dataset.pbox = "1";
    const box = document.createElement("div"); box.style.cssText = "margin:.3rem 0;max-width:" + F.maxw + ";width:100%";
    const fr = document.createElement("div"); fr.style.cssText = "aspect-ratio:" + F.ar + ";width:100%;background:#fff;border:2px solid #555;border-radius:4px;display:flex;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box";
    const cap = document.createElement("div"); cap.style.cssText = "font-size:.72rem;color:#666;margin-top:2px"; cap.textContent = F.note;
    img.parentNode.insertBefore(box, img); fr.appendChild(img); box.appendChild(fr); box.appendChild(cap);
    const hidden0 = img.style.display === "none";
    img.style.cssText = "max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border:0;border-radius:0;margin:0;display:" + (hidden0 ? "none" : "block"); box.className = "pbox";
    const sync = () => { const off = img.style.display === "none" || !img.getAttribute("src"); box.style.display = off ? "none" : ""; };
    new MutationObserver(sync).observe(img, { attributes: true, attributeFilter: ["style", "src"] }); sync(); return img;
  }
  return { rotateBlob, rotateInput, rotateStored, signed, previewBox };
})();
