// ── Free-credit watermarking ─────────────────────────────────────────
// Output generated on FREE credits carries a visible "Swarnix Studio" mark;
// output paid for with a paid credit is clean. The mark has to be obvious
// enough to stop the image being used commercially, but must not cover the
// piece — the whole point of the free tier is that the jeweller can judge our
// quality before paying.
//
// HOW THE GATE WORKS (read this before changing anything here):
//   • Both versions live in Cloudinary. The clean one is never deleted.
//   • app_gallery.image_url holds the WATERMARKED url for free-grade rows.
//   • The clean public_id goes in app_gallery.clean_public_id, which the client
//     cannot select — SELECT on that column is revoked from `authenticated`
//     (see migration studio_hide_clean_public_id_column). It is only readable
//     through the app_clean_public_id() SECURITY DEFINER rpc, which returns
//     null until the account has spent a paid credit.
//
// So a free user holds only watermarked URLs. Stripping the transform from a
// URL they DO have gets them nowhere, because the clean image sits at a
// different, random public_id they have never seen. This is meaningfully
// stronger than a client-side flag, though not a cryptographic guarantee —
// anyone who buys once can of course keep their clean images.

import { db, CLOUDINARY_CLOUD } from './config';

// Cloudinary layer for the mark. Broken out so the styling is in one place:
// bottom-right (`g_south_east`), inset from the edge, semi-transparent white
// with a soft shadow so it stays legible on both light and dark backgrounds.
// `w_0.28,fl_relative` scales the text to ~28% of the image width, so the mark
// is proportionate on a 512px thumb and a 2048px hero alike.
const WATERMARK_LAYER = [
  'l_text:Arial_60_bold:Swarnix%20Studio',
  'co_white',
  'o_62',
  'e_shadow:40',
  'w_0.28',
  'fl_relative',
  'g_south_east',
  'x_28',
  'y_24',
].join(',');

/**
 * Insert the watermark transformation into a Cloudinary delivery URL.
 * Returns the url unchanged if it isn't a Cloudinary upload url (e.g. an n8n
 * result hosted elsewhere) — callers must treat that case as "cannot
 * watermark", see saveGeneration below.
 */
export function watermarkedUrl(url) {
  if (typeof url !== 'string') return url;
  const marker = '/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const head = url.slice(0, i + marker.length);
  const tail = url.slice(i + marker.length);
  return `${head}${WATERMARK_LAYER}/${tail}`;
}

/** True if `url` is a Cloudinary delivery url we can transform. */
export function isCloudinaryUrl(url) {
  return typeof url === 'string'
    && url.includes(`/${CLOUDINARY_CLOUD}/`)
    && url.includes('/upload/');
}

/**
 * Extract the public_id (including folder, without version or extension) from a
 * Cloudinary delivery url. Needed so we can store a reference to the clean
 * image that the client can't turn back into a url on its own.
 */
export function publicIdFromUrl(url) {
  if (!isCloudinaryUrl(url)) return null;
  const after = url.split('/upload/')[1];
  if (!after) return null;
  // Strip a leading version segment (v1234567890/) if present, then the extension.
  const withoutVersion = after.replace(/^v\d+\//, '');
  return withoutVersion.replace(/\.[a-z0-9]+$/i, '');
}

/**
 * Re-upload a generated image into Cloudinary so we own a stable copy.
 * n8n returns URLs that may be temporary or on another host; for free-grade
 * output we MUST hold the clean original ourselves, otherwise the paid unlock
 * has nothing to unlock later.
 *
 * Uses the same unsigned preset as the rest of the app. `folder` keeps clean
 * originals out of the way; the random public_id Cloudinary assigns is what
 * makes them unguessable.
 */
export async function archiveClean(url) {
  const fd = new FormData();
  fd.append('file', url);                       // Cloudinary fetches it server-side
  fd.append('upload_preset', 'jewelleryupload');
  fd.append('folder', 'swarnix-studio-clean');
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: 'POST', body: fd }
  );
  if (!res.ok) throw new Error('Could not archive the clean image');
  const data = await res.json();
  return { publicId: data.public_id, url: data.secure_url };
}

/**
 * Save one generated image to the library with its credit grade.
 *
 *   grade 'paid' → store the url as-is. Nothing to hide.
 *   grade 'free' → archive the clean copy, store the WATERMARKED url as
 *                  image_url, and stash the clean public_id for later unlock.
 *
 * `row` carries the usual app_gallery fields (kind, title, job_id…).
 * Returns { id, displayUrl } — displayUrl is what the caller should show and
 * offer for download, so the preview always matches the saved copy. `id` is
 * null if the insert failed (callers treat a library-save failure as non-fatal:
 * the user still has their image on screen).
 */
export async function saveGeneration({ url, grade, ...row }) {
  let imageUrl = url;
  let cleanPublicId = null;

  if (grade === 'free') {
    // Archive first: if we can't keep a clean copy, we must not hand out a
    // watermark-free url, so fall back to watermarking whatever we have.
    try {
      const clean = await archiveClean(url);
      cleanPublicId = clean.publicId;
      imageUrl = watermarkedUrl(clean.url);
    } catch {
      imageUrl = watermarkedUrl(url);
    }
  }

  const { data, error } = await db
    .from('app_gallery')
    .insert({ ...row, image_url: imageUrl, credit_grade: grade, clean_public_id: cleanPublicId })
    .select('id')
    .single();
  return { id: error ? null : (data?.id ?? null), displayUrl: imageUrl };
}

/**
 * Save several images from one generation at the same grade. Archiving runs in
 * parallel; a single failure doesn't sink the others (saveGeneration already
 * degrades to watermarking the original url).
 * Returns the watermarked-or-original urls in the same order, so the caller can
 * display exactly what it saved.
 */
export async function saveGenerations(urls, grade, row) {
  const saved = await Promise.all(
    urls.map((url) => saveGeneration({ url, grade, ...row }))
  );
  return saved.map((s) => s.displayUrl);
}

/**
 * The URL to hand a user when they download or share a library item.
 * For paid-grade rows that's just image_url. For free-grade rows we ask the
 * server whether this account has since bought — if so it returns the clean
 * public_id and the user gets the un-watermarked image, retroactively, for
 * everything they made on free credits.
 */
export async function downloadUrlFor(item) {
  if (!item) return null;
  if (item.credit_grade !== 'free') return item.image_url;

  const { data, error } = await db.rpc('app_clean_public_id', { p_gallery_id: item.id });
  if (error || !data) return item.image_url;      // still watermarked
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/${data}`;
}

/** Has this account unlocked clean downloads (i.e. spent a paid credit)? */
export async function hasCleanDownloads() {
  const { data, error } = await db.rpc('app_has_paid_grade');
  if (error) return false;
  return data === true;
}
