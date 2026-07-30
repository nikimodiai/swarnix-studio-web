// ── Purchase / credit transaction history ───────────────────────────
// Real purchases live in `app_transactions` (written server-side by the
// verify-razorpay-payment edge function; RLS lets a user read only their own
// rows). The very first entry is the signup welcome bonus — that isn't a
// purchase row, it's the app_pricing.free_quota grant, so we synthesize it from
// the profile's creation time. Mirrors the mobile swarnix-studio app's
// transactions.ts so both surfaces show the same history.

import { db } from './config';

const FREE_QUOTA_FALLBACK = 3;

/**
 * Fetch the user's transactions newest-first, with the signup welcome bonus as
 * the final (oldest) entry. Each row:
 *   { id, title, credits, amount, currency, status, createdAt, isWelcome }
 */
export async function fetchTransactions() {
  const [txRes, profRes, priceRes] = await Promise.all([
    db.from('app_transactions')
      .select('id, provider, credits_added, amount, gst_amount, currency, status, created_at')
      .order('created_at', { ascending: false }),
    db.from('app_profiles').select('created_at').single(),
    db.from('app_pricing').select('free_quota').eq('key', 'default').eq('active', true).maybeSingle(),
  ]);

  if (txRes.error) throw txRes.error;

  const welcomeCredits =
    typeof priceRes.data?.free_quota === 'number' ? priceRes.data.free_quota : FREE_QUOTA_FALLBACK;

  const purchases = (txRes.data ?? []).map((row) => {
    // `amount` in the DB is the PRE-GST base. The customer actually paid
    // base + gst_amount, so history shows that GST-inclusive total. Older rows
    // (pre-GST) have gst_amount = null → total is just the base.
    const base = row.amount != null ? Number(row.amount) : null;
    const gst = row.gst_amount != null ? Number(row.gst_amount) : 0;
    return {
      id: row.id,
      title: row.provider === 'referral'
        ? 'Referral credits added'
        : `${row.credits_added} credit${row.credits_added === 1 ? '' : 's'}`,
      credits: row.credits_added ?? 0,
      amount: base != null ? base + gst : null, // GST-inclusive total paid
      baseAmount: base,
      gstAmount: row.gst_amount != null ? gst : null,
      currency: row.currency ?? 'INR',
      status: row.status ?? 'completed',
      createdAt: row.created_at,
      isWelcome: false,
      isReferral: row.provider === 'referral',
    };
  });

  // Signup welcome bonus — always the oldest row, shown as free.
  if (profRes.data?.created_at) {
    purchases.push({
      id: 'welcome-bonus',
      title: 'Welcome bonus',
      credits: welcomeCredits,
      amount: null,
      currency: 'INR',
      status: 'completed',
      createdAt: profRes.data.created_at,
      isWelcome: true,
    });
  }

  // app_transactions is already desc; the welcome bonus (signup) is oldest, so
  // appending keeps the whole list in descending time order.
  return purchases;
}

/**
 * Download the GST payment receipt PDF for one completed transaction. Calls the
 * generate-receipt edge function (which enforces ownership via the user's JWT +
 * RLS) and saves the returned PDF. Throws on any error so the caller can toast.
 */
export async function downloadReceipt(transactionId) {
  const { data, error } = await db.functions.invoke('generate-receipt', {
    body: { transaction_id: transactionId },
  });
  if (error) {
    // Edge fn returns JSON { error } on failure; supabase-js surfaces it here.
    let msg = 'Could not generate the receipt.';
    try { msg = (await error.context?.json())?.error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  // data is a Blob (application/pdf) — save it.
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${transactionId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** "1 Jul 2026, 12:31 PM" — date AND time for transaction rows. */
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${h12}:${min} ${ampm}`;
}
