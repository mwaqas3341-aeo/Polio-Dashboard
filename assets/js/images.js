/* Picture helpers: validate + shrink phone photos before upload (keeps mobile data use small). */
const IMG_MAX_ORIGINAL = 15 * 1024 * 1024;
async function compressImage(file, maxDim = 1600, quality = 0.8) {
  if (!file) throw new Error("No picture chosen");
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error("Only JPG or PNG pictures are allowed");
  if (file.size > IMG_MAX_ORIGINAL) throw new Error("The picture is larger than 15 MB — please use a smaller photo");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("The picture could not be read")); i.src = url; });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 400 * 1024) return file;                      // already small
    const canvas = document.createElement("canvas"); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;                            // never make it bigger
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}
const fileExt = (f) => (f.type === "image/png" ? "png" : "jpg");
