// ─── Paper-photo intake ──────────────────────────────────────────────────────
// A parent snaps a photo of a drawing on paper; we lift the drawing off the
// paper (flood-fill background removal keyed to the paper's actual color),
// crop to the drawing, and hand back a transparent PNG data URL.

export async function extractDrawingFromPhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  const S = 640;
  const k = Math.min(1, S / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // paper color = median of the four corners
  const corners = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1].map((i) => [
    px[i * 4],
    px[i * 4 + 1],
    px[i * 4 + 2],
  ]);
  corners.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  const paper = corners[Math.floor(corners.length / 2)];

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qs = 0, qe = 0;
  const push = (i: number) => { if (!visited[i]) { visited[i] = 1; queue[qe++] = i; } };
  const isPaper = (i: number) => {
    const o = i * 4;
    const dr = px[o] - paper[0], dg = px[o + 1] - paper[1], db = px[o + 2] - paper[2];
    return dr * dr + dg * dg + db * db < 42 * 42; // close to paper color
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qs < qe) {
    const i = queue[qs++];
    if (!isPaper(i)) continue;
    px[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  ctx.putImageData(data, 0, 0);

  // crop to remaining content
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 0) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) throw new Error("no drawing found");
  const pad = 20;
  const cw = Math.min(w, maxX - minX + 1 + pad * 2);
  const ch = Math.min(h, maxY - minY + 1 + pad * 2);
  const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(cv, sx, sy, cw, ch, 0, 0, cw, ch);
  return out.toDataURL("image/png");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); };
    img.src = url;
  });
}
