// ── Catalog PDF export (P2-1) ────────────────────────────────────────
// Wholesalers forward PDFs on WhatsApp, not links. WhatsApp's document limit is
// 100 MB, but anything much over ~5 MB is painful to send on Indian mobile data
// and some clients recompress it, so we treat 5 MB as a hard target.
//
// Getting under the cap is a search, not a calculation: JPEG size depends
// entirely on how busy the photos are. So we render at a good quality, measure,
// and step the quality down until it fits. Two or three attempts at most —
// each render is a canvas draw, which is fast.

import { renderCatalogPages } from './catalogCanvas';
import { buildPdfFromJpegPages } from './jpegToPdf';
import { downloadUrlFor } from './watermark';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;   // 5 MB

// Tried in order until the PDF fits. Below ~0.55 the jewellery starts showing
// visible JPEG artefacts, which is worse than a slightly bigger file.
const QUALITY_STEPS = [0.9, 0.78, 0.66, 0.55];

/**
 * Resolve every catalog item to the image the user is actually entitled to.
 *
 * A catalog can mix free-grade (watermarked) and paid-grade images. Rather than
 * watermarking the whole PDF when one image is free — which would punish paid
 * images too — each image resolves individually: paid ones come out clean, free
 * ones stay watermarked unless the account has since bought, in which case they
 * ALL unlock. That satisfies "watermark the PDF if any image was generated on
 * free credits" while staying fair once the user pays.
 *
 * `items` are [{ url, name, price, id?, credit_grade? }]; ids come from the
 * library picker. Items without an id pass through untouched.
 */
export async function resolveCatalogItems(items) {
  return Promise.all(items.map(async (it) => {
    if (!it.id || it.credit_grade !== 'free') return it;
    const url = await downloadUrlFor({ id: it.id, image_url: it.url, credit_grade: it.credit_grade });
    return { ...it, url: url || it.url };
  }));
}

/** True if any item in the catalog is still watermarked free-grade output. */
export function hasWatermarkedItems(items) {
  return items.some((it) => it.credit_grade === 'free');
}

/**
 * Build the catalog PDF, stepping JPEG quality down until it lands under
 * MAX_PDF_BYTES. Returns { blob, pages, quality, bytes, overCap }.
 *
 * overCap is true only when even the lowest quality didn't fit — we return the
 * smallest version we managed rather than failing, and let the caller warn.
 */
export async function buildCatalogPdf(items, branding, { perPage = 6 } = {}) {
  const resolved = await resolveCatalogItems(items);

  let last = null;
  for (const quality of QUALITY_STEPS) {
    const pages = await renderCatalogPages(resolved, branding, { perPage, quality });
    const blob = await buildPdfFromJpegPages(pages);
    last = { blob, pages: pages.length, quality, bytes: blob.size, overCap: false };
    if (blob.size <= MAX_PDF_BYTES) return last;
  }
  return { ...last, overCap: true };
}
