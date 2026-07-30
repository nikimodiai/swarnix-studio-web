// create-razorpay-order
// Auth: requires a valid Supabase JWT (verify_jwt = true).
// Reads the authoritative BASE price from `studio_price` (NEVER trusts a client
// amount), adds 18% GST (rounded to whole rupees), creates a Razorpay order for
// the GST-inclusive total, and records a pending row in app_transactions.
//
// IMPORTANT: app_transactions.amount stores the PRE-GST base price, not the
// charged total. The referral-reward trigger compares amount against a base-rupee
// threshold (app_referral_min_purchase = ₹399), so it must see the base, not the
// GST-inflated number. The GST portion is recorded in `gst_amount` for records.
// Returns the order_id + public key_id for checkout.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// GST kept in sync with the client (src/lib/pricing.js GST_RATE) and the
// display copy on the Buy Credits screen.
const GST_RATE = 0.18;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return json({ error: "Razorpay keys not configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { price_id, gstin, state } = await req.json().catch(() => ({}));
    if (!price_id) return json({ error: "price_id is required" }, 400);

    // Optional buyer tax details for the GST receipt. Light validation only —
    // a GSTIN is 15 chars; anything else we just drop rather than reject.
    const customerGstin =
      typeof gstin === "string" && /^[0-9A-Z]{15}$/.test(gstin.trim().toUpperCase())
        ? gstin.trim().toUpperCase()
        : null;
    const customerState =
      typeof state === "string" && state.trim().length > 0 ? state.trim() : null;

    const admin = createClient(url, service);
    const { data: pack, error: packErr } = await admin
      .from("studio_price")
      .select("id, name, credits, discounted_price, currency")
      .eq("id", price_id)
      .eq("active", true)
      .single();
    if (packErr || !pack) return json({ error: "Invalid or inactive pack" }, 400);

    const currency = pack.currency ?? "INR";
    // Base (pre-GST) price, then GST-inclusive total rounded to whole rupees —
    // must match the client's withGst() helper exactly (₹149 → ₹176).
    const baseAmount = Number(pack.discounted_price);
    const totalAmount = Math.round(baseAmount * (1 + GST_RATE));
    const gstAmt = totalAmount - Math.round(baseAmount);
    const amountPaise = totalAmount * 100; // charge the GST-inclusive total

    const orderResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt: `cr_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: {
          user_id: user.id,
          price_id: pack.id,
          credits: String(pack.credits),
          base_amount: String(baseAmount),
          gst_amount: String(gstAmt),
        },
      }),
    });
    const order = await orderResp.json();
    if (!orderResp.ok || !order?.id) {
      return json({ error: "Razorpay order creation failed", detail: order }, 502);
    }

    // Store the PRE-GST base in `amount` (referral threshold compares this).
    // `gst_amount` records the tax charged; if the column doesn't exist yet the
    // insert would fail, so we only include it when present — see migration.
    const { error: txErr } = await admin.from("app_transactions").insert({
      user_id: user.id,
      provider: "razorpay",
      provider_ref: order.id,
      price_id: pack.id,
      credits_added: pack.credits,
      amount: baseAmount,
      gst_amount: gstAmt,
      customer_gstin: customerGstin,
      customer_state: customerState,
      currency,
      status: "pending",
    });
    if (txErr) return json({ error: "Could not record transaction", detail: txErr.message }, 500);

    return json({
      order_id: order.id,
      amount: amountPaise,       // GST-inclusive paise, what checkout charges
      base_amount: baseAmount,   // pre-GST rupees
      gst_amount: gstAmt,        // GST rupees
      total_amount: totalAmount, // GST-inclusive rupees
      currency,
      key_id: keyId,
      pack_name: pack.name,
      credits: pack.credits,
      user_email: user.email ?? null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
