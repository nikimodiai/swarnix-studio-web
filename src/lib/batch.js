// ── Batch upload (P1-1) + Collections (P1-2) ─────────────────────────
// Up to 10 pieces, one shared settings panel, processed through the EXISTING
// n8n workflows one at a time. No new job runner, no queue service — the PRD is
// explicit about that, and a sequential loop is genuinely enough for 10 items.
//
// Two things make this survive real use:
//
//  1. Every piece is persisted to app_batch_items BEFORE any generation starts.
//     If the user closes the tab mid-batch, the rows are already there and the
//     finished results show up in the library. The loop only updates rows.
//
//  2. Credits are reserved PER PIECE, immediately before that piece is
//     generated, and refunded if the provider fails. A failed piece therefore
//     costs nothing, and one failure can't take down the other nine.
//
// Collections (P1-2) are AI MODEL ONLY. Studio Photo and Metal Swap transform
// an existing product photo — there's no model face to keep consistent, so a
// collection picker there would be a control with nothing to control. AI Model
// puts jewellery on a generated person, which is exactly the case a locked
// model reference solves.

import { db } from './config';
import { reserveCredits, refundCredits } from './credits';
import { saveGeneration, hasCleanDownloads } from './watermark';
import { logGeneration } from './analytics';
import { runRetouch, uploadRetouchImage } from './retouch';
import { runAiModel } from './aiModel';
import { deleteTempUpload } from './imageUtils';
import { publicIdFromUrl } from './watermark';

export const MAX_BATCH_PIECES = 10;
// Only ai_model batches may attach a collection.
export const COLLECTION_ELIGIBLE_FEATURES = new Set(['ai_model']);

// ── Collections ─────────────────────────────────────────────────────

export async function fetchCollections() {
  const { data, error } = await db
    .from('app_collections')
    .select('id, name, model_reference_url, model_params, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCollection(name, modelParams = {}) {
  const { data, error } = await db
    .from('app_collections')
    .insert({ name: name.trim(), model_params: modelParams })
    .select('id, name, model_reference_url, model_params')
    .single();
  if (error) throw error;
  return data;
}

export async function renameCollection(id, name) {
  const { error } = await db
    .from('app_collections')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Delete a collection WITHOUT orphaning its images: app_gallery.collection_id
 * is a plain column (no FK), so images survive and simply stop being grouped.
 */
export async function deleteCollection(id) {
  const { error } = await db.from('app_collections').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Lock the collection's model to this image. Called once, with the first
 * successful generation in the collection — every later piece passes this url
 * back as a reference so the same face recurs.
 */
export async function lockCollectionModel(collectionId, url) {
  if (!collectionId || !url) return;
  const { error } = await db
    .from('app_collections')
    .update({ model_reference_url: url, updated_at: new Date().toISOString() })
    .eq('id', collectionId)
    .is('model_reference_url', null);   // never overwrite an existing lock
  if (error) throw error;
}

// ── Batches ─────────────────────────────────────────────────────────

/**
 * Create the batch and all its item rows up front.
 * `pieces` is [{ sourceUrl, label }] — already uploaded to Cloudinary.
 */
export async function createBatch({ feature, settings, collectionId, pieces }) {
  const { data: batch, error } = await db
    .from('app_batches')
    .insert({ feature, settings, collection_id: collectionId || null })
    .select('id')
    .single();
  if (error) throw error;

  const rows = pieces.map((p, i) => ({
    batch_id: batch.id,
    position: i,
    label: p.label?.trim() || null,
    source_url: p.sourceUrl,
  }));
  const { data: items, error: itemsErr } = await db
    .from('app_batch_items')
    .insert(rows)
    .select('id, position, label, source_url, status');
  if (itemsErr) throw itemsErr;

  return { batchId: batch.id, items: items ?? [] };
}

/** Upload the raw device files, in parallel, before the batch is created. */
export async function uploadPieces(files, ownerId, onProgress) {
  let done = 0;
  return Promise.all(files.map(async (file) => {
    const url = await uploadRetouchImage(file, `batch_${ownerId}_${Date.now()}_${file.name}`);
    onProgress?.(++done, files.length);
    return { sourceUrl: url, label: file.name.replace(/\.[^.]+$/, '').slice(0, 60) };
  }));
}

async function updateItem(id, patch) {
  try {
    await db.from('app_batch_items').update(patch).eq('id', id);
  } catch { /* progress bookkeeping must never break the run */ }
}

/**
 * Run every piece in the batch, sequentially.
 *
 * `onUpdate(itemId, patch)` fires as each piece changes state so the UI can
 * show live per-piece progress. Returns a summary the caller can report.
 *
 * Sequential on purpose: these n8n workflows call Gemini, and firing ten
 * concurrent requests is the reliable way to get rate-limited. One at a time is
 * slower but finishes.
 */
export async function runBatch({
  batchId, items, feature, settings, collection, ownerId, onUpdate,
}) {
  let succeeded = 0;
  let failed = 0;
  let refunded = 0;
  // Locked model reference for this collection, if it already has one. The
  // first success in a fresh collection sets it for every piece after.
  let referenceUrl = collection?.model_reference_url || null;

  // A customer who has already bought never sees a watermark again, even on
  // leftover free credits — same rule as chargeSuiteGraded in studioSuite.js.
  // Checked once per batch rather than per item since it can't meaningfully
  // change mid-run.
  const alreadyPaying = await hasCleanDownloads().catch(() => false);

  for (const item of items) {
    await updateItem(item.id, { status: 'generating' });
    onUpdate?.(item.id, { status: 'generating' });

    // Reserve this piece's credit right before doing the work, so a batch that
    // runs out of credits half way stops cleanly rather than generating for free.
    let reserved = null;
    try {
      reserved = await reserveCredits(1);
    } catch {
      reserved = { ok: false, fromFree: 0, fromPaid: 0 };
    }
    if (!reserved.ok) {
      const patch = { status: 'failed', error: 'Not enough credits', completed_at: new Date().toISOString() };
      await updateItem(item.id, patch);
      onUpdate?.(item.id, patch);
      failed++;
      continue;
    }

    const grade = (reserved.fromPaid > 0 || alreadyPaying) ? 'paid' : 'free';
    const startedAt = Date.now();
    try {
      const url = feature === 'ai_model'
        ? await runAiModel({
            ownerId,
            source: item.source_url,
            category: settings.category,
            sel: settings.aiModelSel,
            // Passed for collection consistency. The n8n workflow ignores
            // unknown fields today — see MODEL_REFERENCE_NOTE in BatchStudio.jsx.
            modelReferenceUrl: referenceUrl,
          })
        : await runRetouch({
            ownerId,
            imageUrl: item.source_url,
            mode: feature === 'metal_swap' ? 'variant' : 'retouch',
            style: settings.style,
            styleCustom: settings.styleCustom,
            targetMetal: settings.targetMetal,
            targetMetalCustom: settings.targetMetalCustom,
          });

      const { id: galleryId, displayUrl } = await saveGeneration({
        url,
        grade,
        user_id: ownerId,
        title: item.label || 'Batch piece',
        kind: feature,
        batch_id: batchId,
        collection_id: collection?.id || null,
      });

      // First success in a collection with no locked model becomes the anchor.
      // Collections only apply to ai_model (see COLLECTION_ELIGIBLE_FEATURES);
      // this check is belt-and-braces in case a stale collectionId sneaks in.
      if (feature === 'ai_model' && collection?.id && !referenceUrl) {
        referenceUrl = url;
        try { await lockCollectionModel(collection.id, url); } catch { /* non-fatal */ }
      }

      const patch = {
        status: 'done',
        result_url: displayUrl,
        gallery_id: galleryId,
        completed_at: new Date().toISOString(),
      };
      await updateItem(item.id, patch);
      onUpdate?.(item.id, patch);
      succeeded++;

      logGeneration({
        feature,
        sourceUrl: item.source_url,
        creditGrade: grade,
        creditsConsumed: 1,
        latencyMs: Date.now() - startedAt,
      });
    } catch (e) {
      // Provider failure — give the credit back. The user got nothing.
      try {
        await refundCredits(reserved.fromFree, reserved.fromPaid);
        refunded++;
      } catch { /* best-effort */ }

      const patch = {
        status: 'failed',
        error: (e?.message || 'Generation failed').slice(0, 300),
        credit_refunded: true,
        completed_at: new Date().toISOString(),
      };
      await updateItem(item.id, patch);
      onUpdate?.(item.id, patch);
      failed++;

      logGeneration({
        feature,
        status: 'failed',
        sourceUrl: item.source_url,
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      // Every batch piece is a device upload (batch has no library-pick path),
      // so its source is always a temp upload — safe to delete once this
      // item's generation is done, success or fail.
      deleteTempUpload(publicIdFromUrl(item.source_url));
    }
  }

  try {
    await db.from('app_batches')
      .update({
        status: failed === items.length ? 'failed' : 'done',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
  } catch { /* non-fatal */ }

  return { succeeded, failed, refunded };
}

/** Reload a batch's items — used to resume a batch the user navigated away from. */
export async function fetchBatchItems(batchId) {
  const { data, error } = await db
    .from('app_batch_items')
    .select('id, position, label, source_url, result_url, status, error, credit_refunded')
    .eq('batch_id', batchId)
    .order('position');
  if (error) throw error;
  return data ?? [];
}
