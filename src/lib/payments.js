// ── Razorpay payment flow (web) ─────────────────────────────────────
//   1. createRazorpayOrder(price_id) → edge fn creates a real order with the
//      SECRET key and returns { order_id, amount, key_id, ... }.
//   2. openRazorpayCheckout(order)   → loads Razorpay's checkout.js and opens
//      the standard checkout against that order_id.
//   3. verifyRazorpayPayment(...)    → edge fn checks the signature and grants
//      credits idempotently. The Razorpay webhook is the redundant
//      source-of-truth if the tab closes before step 3.
//
// db.functions.invoke automatically attaches the user's JWT, which the edge
// functions require (verify_jwt = true). Same edge functions the mobile app uses
// (create-razorpay-order / verify-razorpay-payment).

import { db } from './config';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export async function createRazorpayOrder(priceId) {
  const { data, error } = await db.functions.invoke('create-razorpay-order', {
    body: { price_id: priceId },
  });
  if (error) throw new Error(error.message ?? 'Could not start checkout');
  if (!data?.order_id) throw new Error(data?.error ?? 'Could not create order');
  return data; // { order_id, amount, currency, key_id, pack_name, credits, user_email }
}

export async function verifyRazorpayPayment(result) {
  const { data, error } = await db.functions.invoke('verify-razorpay-payment', {
    body: result,
  });
  if (error) throw new Error(error.message ?? 'Payment verification failed');
  return {
    success: Boolean(data?.success),
    credits_added: Number(data?.credits_added ?? 0),
  };
}

// Lazy-load Razorpay's checkout.js once.
function loadCheckoutScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay checkout.')));
      return;
    }
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay checkout.'));
    document.body.appendChild(s);
  });
}

/**
 * Open the Razorpay checkout for a server-created order. Resolves with the
 * checkout result { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * on success; rejects with { code: 'dismissed' } if the user closes the modal,
 * or an Error on payment failure.
 */
export async function openRazorpayCheckout(order) {
  await loadCheckoutScript();
  return new Promise((resolve, reject) => {
    let settled = false;
    const options = {
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Swarnix Studio',
      image: `${window.location.origin}/swarnix-studio-logo.png`,
      description: `${order.credits} credits · ${order.pack_name}`,
      prefill: { email: order.user_email ?? '' },
      theme: { color: '#C9A84C' },
      // Explicit method config: UPI first (India's default rail), plus card/
      // netbanking/wallet. `config.display` reorders Razorpay's own method
      // list — it doesn't add methods your Razorpay account isn't enabled for.
      config: {
        display: {
          blocks: {
            upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
            other: {
              name: 'Other ways to pay',
              instruments: [
                { method: 'card' },
                { method: 'netbanking' },
                { method: 'wallet' },
              ],
            },
          },
          sequence: ['block.upi', 'block.other'],
          preferences: { show_default_blocks: false },
        },
      },
      // We never want Razorpay to store/tokenize the card for reuse — no
      // "save this card" checkbox, no re-use of stored instruments.
      remember_customer: false,
      handler(response) {
        settled = true;
        resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        escape: true,
        backdropclose: false,
        ondismiss() {
          if (!settled) { const e = new Error('Checkout closed'); e.code = 'dismissed'; reject(e); }
        },
      },
    };
    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        settled = true;
        reject(new Error(resp?.error?.description || 'Payment failed'));
      });
      rzp.open();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
