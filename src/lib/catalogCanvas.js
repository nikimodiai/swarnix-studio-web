// ── WhatsApp catalog canvas rendering ─────────────────────────────────
// Lays out picked products (image + name + price) 2-per-row in a branded
// grid, one <canvas> per page, so the export reads well as a WhatsApp
// Status/forward image rather than a giant scroll. Pure client-side —
// no credits, no backend.
//
// Images are NEVER cropped: each card's image area is sized to the photo's
// own aspect ratio (scaled to the column width), so the full item is always
// visible — no "cover" cutoff, and no fixed box leaving letterboxed
// whitespace either, since there's no fixed box to begin with.

export const PAGE_WIDTH = 1080;
const COLS = 2;
const GAP = 16;
const PAD_X = 32;
const LABEL_H = 64; // name + price strip under each image

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * items: [{ url, name, price }]. branding: { storeName, storePhone, storeLogoUrl }.
 * Page height is NOT fixed — it grows to fit however tall the 2-column
 * layout needs to be for these specific images (no cropping means we can't
 * know the height in advance), so pages don't split items awkwardly either:
 * every item picked renders on exactly one page, at full size, uncropped.
 * Returns an array of Blobs (image/jpeg).
 */
export async function renderCatalogPages(items, branding) {
  if (items.length === 0) return [];

  // Pre-load every image once (also used to measure natural aspect ratio).
  const loaded = await Promise.all(items.map(async (it) => {
    try {
      const img = await loadImage(it.url);
      return { ...it, img, ratio: img.height / img.width };
    } catch {
      return { ...it, img: null, ratio: 1 };
    }
  }));

  // Simple two-column flow: alternate items into the shorter column so the
  // page stays reasonably balanced, matching how they'll actually be drawn.
  const colW = (PAGE_WIDTH - PAD_X * 2 - GAP) / COLS;
  const colHeights = new Array(COLS).fill(0);
  const placed = loaded.map((it) => {
    const col = colHeights[0] <= colHeights[1] ? 0 : 1;
    const imgH = colW * it.ratio;
    const cellH = imgH + LABEL_H;
    const y = colHeights[col];
    colHeights[col] += cellH + GAP;
    return { ...it, col, y, imgH, cellH };
  });

  const headerH = branding?.storeLogoUrl || branding?.storeName ? 32 + 56 + 16 + 20 : 32;
  const footerH = 60;
  const pageHeight = Math.ceil(headerH + Math.max(...colHeights) + footerH);

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FAF9F6';
  ctx.fillRect(0, 0, PAGE_WIDTH, pageHeight);

  let y = 32;
  const storeName = branding?.storeName?.trim();
  ctx.textBaseline = 'top';
  let textX = PAD_X;
  const logoSize = 56;
  if (branding?.storeLogoUrl) {
    try {
      const img = await loadImage(branding.storeLogoUrl);
      ctx.save();
      roundRect(ctx, PAD_X, y, logoSize, logoSize, 12);
      ctx.clip();
      const scale = Math.min(logoSize / img.width, logoSize / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, PAD_X + (logoSize - dw) / 2, y + (logoSize - dh) / 2, dw, dh);
      ctx.restore();
      textX = PAD_X + logoSize + 16;
    } catch { /* skip */ }
  }
  if (storeName || branding?.storeLogoUrl) {
    ctx.fillStyle = '#0B1829';
    ctx.font = "700 32px Georgia, 'Times New Roman', serif";
    ctx.fillText(storeName || 'Our Collection', textX, y + 4);
    if (branding?.storePhone) {
      ctx.fillStyle = '#8A8175';
      ctx.font = "400 18px 'Segoe UI', sans-serif";
      ctx.fillText(branding.storePhone, textX, y + 34);
    }
    y += logoSize + 16;
    ctx.strokeStyle = 'rgba(201,168,76,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD_X, y); ctx.lineTo(PAGE_WIDTH - PAD_X, y); ctx.stroke();
    y += 20;
  }

  const gridTop = y;
  const colX = [PAD_X, PAD_X + colW + GAP];

  for (const it of placed) {
    const cx = colX[it.col];
    const cy = gridTop + it.y;

    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, cx, cy, colW, it.cellH, 14);
    ctx.fill();
    ctx.strokeStyle = '#E6E6EA';
    ctx.lineWidth = 1;
    roundRect(ctx, cx, cy, colW, it.cellH, 14);
    ctx.stroke();

    if (it.img) {
      ctx.save();
      roundRect(ctx, cx, cy, colW, it.imgH, 14);
      ctx.clip();
      // Draw at the column's exact width, height derived from the image's
      // own aspect ratio — the box IS the image's shape, so nothing is
      // cropped and there's no leftover space to pad.
      ctx.drawImage(it.img, cx, cy, colW, it.imgH);
      ctx.restore();
    }

    const textY = cy + it.imgH + 10;
    ctx.fillStyle = '#1f2430';
    ctx.font = "700 24px 'Segoe UI', sans-serif";
    const name = (it.name || 'Item').slice(0, 26);
    ctx.fillText(name, cx + 14, textY);

    if (it.price) {
      ctx.fillStyle = '#9a7b2e';
      ctx.font = "700 24px 'Segoe UI', sans-serif";
      ctx.fillText(`₹${it.price}`, cx + 14, textY + 28);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#9a9aa2';
  ctx.font = "400 18px 'Segoe UI', sans-serif";
  ctx.fillText('Made with Swarnix Studio', PAGE_WIDTH / 2, pageHeight - 32);
  ctx.textAlign = 'left';

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      // toBlob resolves with `null` (rather than throwing) when the canvas
      // has been tainted by a cross-origin image drawn without CORS headers —
      // reject explicitly so the caller's catch actually fires instead of the
      // export silently hanging with a null page.
      if (b) resolve(b);
      else reject(new Error('Could not export the catalog — an image blocked cross-origin export.'));
    }, 'image/jpeg', 0.92);
  });

  return [{ blob, width: PAGE_WIDTH, height: pageHeight }];
}
