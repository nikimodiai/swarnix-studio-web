// ── Credit-pack pricing ─────────────────────────────────────────────
// Packs are owner-controlled rows in the `studio_price` table (RLS: any
// signed-in user may read active packs; only the dashboard/service role writes
// them). The client NEVER decides the amount — the create-razorpay-order edge
// function re-reads the price server-side so a tampered client can't change what
// it's charged. Same table + shape the mobile swarnix-studio app uses.

import { db } from './config';

// ── GST ───────────────────────────────────────────────────────────────
// All listed pack prices (studio_price.discounted_price) are the pre-tax BASE.
// We add 18% GST on top at checkout. The server (create-razorpay-order) is the
// source of truth for the charged amount; these helpers must produce the SAME
// number the edge function charges, or the displayed total won't match the bill.
export const GST_RATE = 0.18;

/** GST-inclusive total for a base amount, rounded to whole rupees (₹149 → ₹176). */
export function withGst(base) {
  return Math.round(Number(base) * (1 + GST_RATE));
}

/** Just the GST portion of a base amount, whole rupees (so base + gst === withGst). */
export function gstAmount(base) {
  return withGst(base) - Math.round(Number(base));
}

// Indian states/UTs for the optional "place of supply" field on the GST
// receipt. Order alphabetical; used to populate the checkout state dropdown.
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

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
