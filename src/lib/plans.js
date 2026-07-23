// ── Plan helpers — compat shim ──────────────────────────────────────
// The ported feature components import a few helpers from the Swarnix owner
// app's plans.js. This product has NO subscription plans — every signed-in user
// gets Studio Suite, gated only by their credit balance. So the feature toggles
// are always on and "limits" are expressed via the credit balance instead.

// Studio Suite (and every feature within it) is always unlocked here.
export function hasFeature(_store, _featureKey) {
  return true;
}

// The ported components ask effectiveLimit(store, 'ai_studio_suite') to render a
// meter. We report the credit balance as the "limit" so any UI referencing it
// shows a real number rather than Infinity.
export function effectiveLimit(store, _resource) {
  return Math.max(0, Math.floor(store?._credits_remaining || 0));
}

// Render a limit value for display.
export function fmtLimit(v) {
  if (v === Infinity || v === 'unlimited' || v == null) return '∞';
  return Number(v).toLocaleString('en-IN');
}

// ── Reel credit pricing ─────────────────────────────────────────────
// Ported verbatim from the mobile studio (src/lib/reelCredits.ts). Seedance cost
// scales with duration AND quality; reels are silent (music added by the render
// service) so we price on the no-audio tier. A reel costs this many credits.
const REEL_UNITS_PER_SECOND = {
  '480p': 0.35,  // SD
  '720p': 0.75,  // HD
  '1080p': 1.6,  // Full HD
};

// Credits required for a reel of `lengthSeconds` at `resolution`. Whole ≥ 1.
export function reelSuiteCost(lengthSeconds, resolution) {
  const rate = REEL_UNITS_PER_SECOND[resolution] ?? REEL_UNITS_PER_SECOND['720p'];
  return Math.max(1, Math.ceil(lengthSeconds * rate));
}
