// ── WhatsApp catalog canvas rendering ─────────────────────────────────
// Lays out picked products (image + name + price) in a branded grid, one
// <canvas> per page, ready to forward on WhatsApp. Pure client-side — no
// credits, no backend.
//
// Two output shapes:
//
//   'flow' — the original single tall page, 2 columns, images at their own
//            natural aspect ratio so nothing is ever cropped. Best for a short
//            list forwarded as one image.
//
//   'a4'   — A4 portrait pages, 6 or 9 products per page (P2-1). Wholesalers
//            forward PDF catalogs, and a PDF wants real pages. Here each cell
//            IS a fixed box, so images are fitted (contain, never cropped)
//            inside it with the leftover space left white.
//
// Both paths keep the same branded header and are exported as JPEG, because
// the PDF packer embeds JPEG directly (DCTDecode) with no re-encoding.

export const PAGE_WIDTH = 1080;
const COLS = 2;
const GAP = 16;
const PAD_X = 32;
const LABEL_H = 64; // name + price strip under each image

// A4 portrait at ~150 DPI. Enough for a phone screen and for print, while
// keeping the file small enough for WhatsApp.
export const A4_WIDTH = 1240;
export const A4_HEIGHT = 1754;

// Products per A4 page → grid shape.
export const A4_LAYOUTS = {
  6: { cols: 2, rows: 3 },
  9: { cols: 3, rows: 3 },
};

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

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      // toBlob resolves with `null` (rather than throwing) when the canvas has
      // been tainted by a cross-origin image drawn without CORS headers —
      // reject explicitly so the caller's catch actually fires instead of the
      // export silently hanging with a null page.
      if (b) resolve(b);
      else reject(new Error('Could not export the catalog — an image blocked cross-origin export.'));
    }, 'image/jpeg', quality);
  });
}

// Draw the shop's logo / name / phone at the top of a page. Returns the y
// coordinate the content grid should start at.
async function drawHeader(ctx, branding, width, opts = {}) {
  const { compact = false } = opts;
  let y = compact ? 24 : 32;
  const storeName = branding?.storeName?.trim();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let textX = PAD_X;
  const logoSize = compact ? 44 : 56;

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
    } catch { /* skip a logo that won't load */ }
  }

  if (storeName || branding?.storeLogoUrl) {
    ctx.fillStyle = '#0B1829';
    ctx.font = `700 ${compact ? 28 : 32}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(storeName || 'Our Collection', textX, y + 4);
    if (branding?.storePhone) {
      ctx.fillStyle = '#8A8175';
      ctx.font = "400 18px 'Segoe UI', sans-serif";
      ctx.fillText(branding.storePhone, textX, y + (compact ? 30 : 34));
    }
    y += logoSize + 16;
    ctx.strokeStyle = 'rgba(201,168,76,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD_X, y); ctx.lineTo(width - PAD_X, y); ctx.stroke();
    y += 20;
  }
  return y;
}

/**
 * A4 portrait pages, `perPage` products each (6 or 9).
 *
 * `quality` is the JPEG quality; buildCatalogPdf lowers it and retries when the
 * file comes out over the WhatsApp-friendly size cap.
 */
async function renderA4Pages(items, branding, perPage, quality) {
  const layout = A4_LAYOUTS[perPage] || A4_LAYOUTS[6];
  const { cols, rows } = layout;
  const pages = [];
  const pageCount = Math.ceil(items.length / perPage);

  // Pre-load once for the whole document rather than per page.
  const loaded = await Promise.all(items.map(async (it) => {
    try { return { ...it, img: await loadImage(it.url) }; }
    catch { return { ...it, img: null }; }
  }));

  for (let p = 0; p < pageCount; p++) {
    const slice = loaded.slice(p * perPage, (p + 1) * perPage);

    const canvas = document.createElement('canvas');
    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    const gridTop = await drawHeader(ctx, branding, A4_WIDTH, { compact: true });
    const footerH = 56;
    const cellW = (A4_WIDTH - PAD_X * 2 - GAP * (cols - 1)) / cols;
    const gridH = A4_HEIGHT - gridTop - footerH;
    const cellH = (gridH - GAP * (rows - 1)) / rows;
    const imgH = cellH - LABEL_H;

    slice.forEach((it, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cx = PAD_X + c * (cellW + GAP);
      const cy = gridTop + r * (cellH + GAP);

      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, cx, cy, cellW, cellH, 14);
      ctx.fill();
      ctx.strokeStyle = '#E6E6EA';
      ctx.lineWidth = 1;
      roundRect(ctx, cx, cy, cellW, cellH, 14);
      ctx.stroke();

      if (it.img) {
        // Contain, not cover: the whole piece must be visible, so we fit it
        // inside the cell and centre whatever space is left over.
        const scale = Math.min(cellW / it.img.width, imgH / it.img.height);
        const dw = it.img.width * scale;
        const dh = it.img.height * scale;
        ctx.save();
        roundRect(ctx, cx, cy, cellW, imgH, 14);
        ctx.clip();
        ctx.drawImage(it.img, cx + (cellW - dw) / 2, cy + (imgH - dh) / 2, dw, dh);
        ctx.restore();
      }

      const textY = cy + imgH + 10;
      const nameMax = cols === 3 ? 18 : 26;
      ctx.fillStyle = '#1f2430';
      ctx.font = `700 ${cols === 3 ? 20 : 24}px 'Segoe UI', sans-serif`;
      ctx.fillText((it.name || 'Item').slice(0, nameMax), cx + 14, textY);

      if (it.price) {
        ctx.fillStyle = '#9a7b2e';
        ctx.font = `700 ${cols === 3 ? 20 : 24}px 'Segoe UI', sans-serif`;
        ctx.fillText(`₹${it.price}`, cx + 14, textY + (cols === 3 ? 24 : 28));
      }
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9a9aa2';
    ctx.font = "400 17px 'Segoe UI', sans-serif";
    ctx.fillText(
      pageCount > 1 ? `Made with Swarnix Studio · ${p + 1} / ${pageCount}` : 'Made with Swarnix Studio',
      A4_WIDTH / 2, A4_HEIGHT - 34
    );
    ctx.textAlign = 'left';

    pages.push({ blob: await canvasToJpeg(canvas, quality), width: A4_WIDTH, height: A4_HEIGHT });
  }

  return pages;
}

/**
 * items: [{ url, name, price }]. branding: { storeName, storePhone, storeLogoUrl }.
 *
 * opts.perPage — 6 or 9 for paginated A4; omit (or 0) for the original single
 * tall flowing page.
 * opts.quality — JPEG quality, default 0.92.
 *
 * Returns an array of { blob, width, height }.
 */
export async function renderCatalogPages(items, branding, opts = {}) {
  if (items.length === 0) return [];
  const { perPage = 0, quality = 0.92 } = opts;
  if (perPage) return renderA4Pages(items, branding, perPage, quality);

  // ── Original single-page flow layout ──
  // Page height is NOT fixed — it grows to fit however tall the 2-column
  // layout needs to be for these specific images (no cropping means we can't
  // know the height in advance), so pages don't split items awkwardly either.
  const loaded = await Promise.all(items.map(async (it) => {
    try {
      const img = await loadImage(it.url);
      return { ...it, img, ratio: img.height / img.width };
    } catch {
      return { ...it, img: null, ratio: 1 };
    }
  }));

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

  const gridTop = await drawHeader(ctx, branding, PAGE_WIDTH);
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
    ctx.fillText((it.name || 'Item').slice(0, 26), cx + 14, textY);

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

  return [{ blob: await canvasToJpeg(canvas, quality), width: PAGE_WIDTH, height: pageHeight }];
}
