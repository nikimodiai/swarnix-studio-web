// ── Credits — server-enforced reserve / refund ──────────────────────
// Credits are enforced server-side via SECURITY DEFINER RPCs (not direct table
// writes) so the charge stays atomic and tamper-resistant. Same contract as the
// mobile swarnix-studio app (db/schema.sql §7):
//
//   app_reserve_credits(amount)     → atomically reserves `amount` up front (free
//                                     allowance first, then paid); returns the
//                                     split so we can refund exactly what was
//                                     taken if the work fails.
//   app_refund_credits(free, paid)  → returns a reserved split on failure.
//   app_tryons_remaining()          → total credits left (free + paid).
//
// The reserve-on-submit model stops a user queueing work they can't pay for.

import { db } from './config';

/**
 * Reserve `amount` credits atomically before starting a generation. Returns
 * { ok, fromFree, fromPaid }. ok=false (0/0 split) means the user didn't have
 * enough — do NOT start the work. Pass the split back to refund() on failure.
 */
export async function reserveCredits(amount) {
  const { data, error } = await db.rpc('app_reserve_credits', { p_amount: amount });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: row?.ok === true,
    fromFree: Number(row?.from_free ?? 0),
    fromPaid: Number(row?.from_paid ?? 0),
  };
}

/** Refund a previously reserved split when a generation fails. No-op if empty. */
export async function refundCredits(fromFree, fromPaid) {
  if (fromFree <= 0 && fromPaid <= 0) return;
  const { error } = await db.rpc('app_refund_credits', {
    p_from_free: fromFree,
    p_from_paid: fromPaid,
  });
  if (error) throw error;
}

/** Total credits remaining for the current user (free allowance + paid). */
export async function creditsRemaining() {
  const { data, error } = await db.rpc('app_tryons_remaining');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/**
 * Run a credit-gated generation with reserve-up-front + refund-on-failure.
 *
 *   const url = await withCredits(cost, refreshStore, () => runGeneration());
 *
 * - Reserves `cost` credits; throws NotEnoughCreditsError if the balance is short
 *   (callers should have already gated the UI, but this is the hard stop).
 * - Runs `work()`. On success, keeps the charge and refreshes the balance.
 * - On failure, refunds the exact reserved split and rethrows the original error.
 *
 * `refresh` is optional (the auth hook's refreshStore) so the header balance
 * updates immediately after the charge settles.
 */
export async function withCredits(cost, refresh, work) {
  const amount = Math.max(1, Math.ceil(cost));
  const res = await reserveCredits(amount);
  if (!res.ok) {
    const err = new Error('Not enough credits. Buy more to keep creating.');
    err.code = 'NO_CREDITS';
    throw err;
  }
  try {
    const out = await work();
    await refresh?.();
    return out;
  } catch (e) {
    // Give the credits back — the user got nothing.
    try { await refundCredits(res.fromFree, res.fromPaid); } catch { /* best-effort */ }
    await refresh?.();
    throw e;
  }
}
