// ── Studio Suite quota helpers — CREDIT-BACKED compat shim ──────────
// The six feature components were ported verbatim from the Swarnix owner web
// app, where these helpers gated a monthly meter (stores._ai_studio_suite_used).
// Here they resolve to the per-user CREDIT balance (app_profiles free + paid),
// enforced server-side by the app_reserve/refund RPCs. Keeping the SAME exported
// API means the feature components didn't have to change how they gate or charge:
//
//   canUseSuite(store, n)     → balance >= n
//   suiteUnitsLeft(store)     → credits remaining
//   suiteUsageText(store)     → "N credits left"
//   chargeSuite(ownerId, n)   → atomically deduct n credits on success (server RPC)
//
// chargeSuite() reserves-then-keeps: it calls app_reserve_credits(n), which
// deducts atomically. Callers invoke it AFTER a successful generation, so a
// failed generation never charges (matches the old charge-on-success behaviour,
// now tamper-resistant because the deduction happens in a SECURITY DEFINER RPC).

import { reserveCredits } from './credits';
import { hasCleanDownloads } from './watermark';

// The six Studio Suite features and their app_gallery `kind`.
export const SUITE_FEATURES = {
  studio_photo:     { label: 'Studio Photo',     kind: 'studio_photo' },
  metal_swap:       { label: 'Metal Swap',       kind: 'metal_swap' },
  jewellery_design: { label: 'Jewellery Design', kind: 'design' },
  ai_model:         { label: 'AI Model',         kind: 'ai_model' },
  reels:            { label: 'Generate Reels',   kind: 'reel' },
};

// Credits the account has left (the auth shim projects this onto the store).
export function suiteUnitsLeft(store) {
  return Math.max(0, Math.floor(store?._credits_remaining || 0));
}

// True if there's at least `need` credits left. (Studio Suite is always unlocked
// on this product — there is no plan gate — so we only check the balance.)
export function canUseSuite(store, need = 1) {
  return suiteUnitsLeft(store) >= need;
}

// Human label for the usage line, e.g. "7 credits left".
export function suiteUsageText(store) {
  const left = suiteUnitsLeft(store);
  return `${left} credit${left === 1 ? '' : 's'} left`;
}

// Deduct `units` credits for a successful generation. Uses the atomic
// reserve RPC (free allowance first, then paid). Returns true if charged.
// Callers already gate with canUseSuite(), so a race to insufficient balance is
// the only reason this returns false. `ownerId` is accepted for signature
// compatibility with the ported components but the RPC keys off auth.uid().
export async function chargeSuite(ownerId, units) {
  const n = Math.ceil(units || 0);
  if (n <= 0) return true;
  try {
    const res = await reserveCredits(n);
    return res.ok;
  } catch {
    // A charge failure must not lose the user their generated image — it's
    // already shown/saved. Log-and-continue mirrors the old best-effort update.
    return false;
  }
}

/**
 * Same charge, but reports which grade of credit paid for it so the caller can
 * watermark free-grade output. Returns { ok, grade }.
 *
 * grade is 'free' only if BOTH:
 *   - the charge came entirely out of the free allowance (a charge that
 *     straddles the boundary — last free credit + first paid one — counts as
 *     paid, so we never watermark something the user part-paid for), AND
 *   - the account has never had paid-grade output before.
 *
 * That second condition matters: once someone has bought a pack, watermarking
 * their leftover free credits reads as a bait-and-switch, not a trial. A
 * customer who has already paid should never see a watermark again, even on
 * top-up free credits (a re-grant, a promo, etc). "Watermark = try before you
 * buy" stops applying the moment they've bought.
 *
 * Kept separate from chargeSuite() so the existing callers that don't care
 * about grade keep working unchanged.
 */
export async function chargeSuiteGraded(ownerId, units) {
  const n = Math.ceil(units || 0);
  if (n <= 0) return { ok: true, grade: 'paid' };
  try {
    const res = await reserveCredits(n);
    if (!res.ok) return { ok: false, grade: 'paid' };
    if (res.fromPaid > 0) return { ok: true, grade: 'paid' };
    // Entirely free-funded — but a returning paying customer never gets
    // watermarked. This branch carries more weight than it looks: the reserve
    // RPC spends the FREE allowance first, so a buyer who still has free
    // credits left keeps landing here on every new generation. It is
    // hasCleanDownloads() alone that stops their output being watermarked
    // after they've paid — which is why app_has_paid_grade() must mean "has
    // ever bought", not "has already spent a paid credit". When that RPC
    // meant the latter, this returned 'free' for paying customers forever.
    const alreadyPaying = await hasCleanDownloads().catch(() => false);
    return { ok: true, grade: alreadyPaying ? 'paid' : 'free' };
  } catch {
    return { ok: false, grade: 'paid' };
  }
}
