// ── Credit-pack pricing ─────────────────────────────────────────────
// Packs are owner-controlled rows in the `studio_price` table (RLS: any
// signed-in user may read active packs; only the dashboard/service role writes
// them). The client NEVER decides the amount — the create-razorpay-order edge
// function re-reads the price server-side so a tampered client can't change what
// it's charged. Same table + shape the mobile swarnix-studio app uses.

import { db } from './config';

/** Whole-number discount percentage, e.g. 99 → 79 returns 20. */
export function discountPct(pack) {
  if (!pack.price || pack.discounted_price >= pack.price) return 0;
  return Math.round(((pack.price - pack.discounted_price) / pack.price) * 100);
}

/** Format an amount as ₹1,234 (no decimals for whole rupees). */
export function formatINR(amount, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  const whole = Number.isInteger(amount) ? amount : Math.round(amount);
  return `${symbol}${whole.toLocaleString('en-IN')}`;
}

/** Fetch the active credit packs, cheapest first. */
export async function fetchCreditPacks() {
  const { data, error } = await db
    .from('studio_price')
    .select('id, name, credits, price, discounted_price, currency, badge, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
