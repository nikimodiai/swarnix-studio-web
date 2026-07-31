// ── Generation analytics (P0-4) ──────────────────────────────────────
// One row per generation attempt, successes AND failures, so the owner can read
// first-pass accept rate and true cost per usable image.
//
// EVERY function here is fire-and-forget: nothing throws, nothing is awaited on
// the generation path. A broken analytics write must never cost a user their
// image or slow the app down. That is why each call is wrapped and the errors
// are swallowed rather than surfaced.

import { db } from './config';

/**
 * Stable short hash of the source image URL, so repeated attempts against the
 * same photo group together for the retry/accept-rate maths. FNV-1a — not
 * cryptographic, just a cheap bucketing key, and it keeps the raw URL out of
 * the analytics table.
 */
export function sourceHash(url) {
  if (typeof url !== 'string' || !url) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Log one generation. Returns the new event id (or null) so the caller can
 * later mark it downloaded/shared — awaiting this is optional and safe.
 *
 *   feature   studio_photo | metal_swap | ai_model | design | reel
 *   status    'ok' | 'failed'
 */
export async function logGeneration({
  feature,
  status = 'ok',
  sourceUrl = null,
  creditGrade = null,
  creditsConsumed = 0,
  latencyMs = null,
  modelUsed = null,
  providerCostUsd = null,
}) {
  try {
    const hash = sourceHash(sourceUrl);
    // Link this attempt to an earlier one on the same source within 10 minutes,
    // which is what makes a retry distinguishable from a fresh generation.
    let regeneratedFrom = null;
    if (hash) {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await db
        .from('app_generation_events')
        .select('id')
        .eq('source_image_hash', hash)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      regeneratedFrom = data?.[0]?.id ?? null;
    }

    const { data, error } = await db
      .from('app_generation_events')
      .insert({
        feature,
        status,
        source_image_hash: hash,
        credit_grade: creditGrade,
        credits_consumed: creditsConsumed,
        regenerated_from_id: regeneratedFrom,
        latency_ms: latencyMs,
        model_used: modelUsed,
        provider_cost_usd: providerCostUsd,
      })
      .select('id')
      .single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/** Mark a logged generation as downloaded. No-op without an id. */
export async function markDownloaded(eventId) {
  if (!eventId) return;
  try {
    await db.from('app_generation_events')
      .update({ downloaded_at: new Date().toISOString() })
      .eq('id', eventId)
      .is('downloaded_at', null);
  } catch { /* fire-and-forget */ }
}

/** Mark a logged generation as shared. No-op without an id. */
export async function markShared(eventId) {
  if (!eventId) return;
  try {
    await db.from('app_generation_events')
      .update({ shared_at: new Date().toISOString() })
      .eq('id', eventId)
      .is('shared_at', null);
  } catch { /* fire-and-forget */ }
}

/** Read the owner dashboard. Throws for non-admins (the rpc raises). */
export async function fetchAnalytics() {
  const { data, error } = await db.rpc('app_studio_analytics');
  if (error) throw error;
  return data;
}

/** Is the signed-in user the studio admin? Never throws. */
export async function isStudioAdmin() {
  try {
    const { data, error } = await db.rpc('app_is_studio_admin');
    return !error && data === true;
  } catch {
    return false;
  }
}
