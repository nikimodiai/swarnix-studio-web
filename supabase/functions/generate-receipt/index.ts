// generate-receipt
// Auth: requires a valid Supabase JWT (verify_jwt = true).
// Returns a PDF payment receipt for ONE completed app_transactions row owned by
// the caller. Receipt number is payment-id based. Tax split:
//   • buyer in Maharashtra (state code 27 / "Maharashtra")  → CGST 9% + SGST 9%
//   • otherwise (or unknown state)                          → IGST 18%
//
// This is a payment RECEIPT, not a strictly-sequential GST tax invoice. It shows
// the seller GSTIN + tax breakdown so business buyers have documentation for ITC,
// but the number is not a gapless invoice series.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Seller (Nelishka AI Solutions) ────────────────────────────────────
const SELLER = {
  name: "Nelishka AI Solutions",
  address: "Mumbai, India",
  gstin: "27AQDPK3941M1ZK", // 27 = Maharashtra
  stateName: "Maharashtra",
  stateCode: "27",
  sac: "998314", // IT design & development services — confirm with CA
};
const GST_RATE = 0.18;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function money(n: number): string {
  return "INR " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Is the buyer intra-state (Maharashtra)? Prefer their GSTIN prefix, then the
// free-text state field. Unknown → treat as inter-state (IGST).
function isIntraState(gstin: string | null, state: string | null): boolean {
  if (gstin && gstin.length >= 2) return gstin.slice(0, 2) === SELLER.stateCode;
  if (state) return /maharashtra/i.test(state) || state.trim() === SELLER.stateCode;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    // User-scoped client → RLS ensures the caller can only read THEIR own row.
    const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await db.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { transaction_id } = await req.json().catch(() => ({}));
    if (!transaction_id) return json({ error: "transaction_id is required" }, 400);

    const { data: tx, error: txErr } = await db
      .from("app_transactions")
      .select("id, provider, provider_payment_id, provider_ref, credits_added, amount, gst_amount, customer_gstin, customer_state, currency, status, created_at")
      .eq("id", transaction_id)
      .single();
    if (txErr || !tx) return json({ error: "Receipt not found" }, 404);
    if (tx.status !== "completed") return json({ error: "Receipt is only available for completed payments" }, 400);
    if (tx.provider === "referral" || tx.amount == null) {
      return json({ error: "No receipt for free / bonus credits" }, 400);
    }

    const { data: prof } = await db
      .from("app_profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const base = Number(tx.amount);
    // Trust the stored gst_amount; fall back to recomputing if an old row lacks it.
    const gst = tx.gst_amount != null ? Number(tx.gst_amount) : Math.round(base * (1 + GST_RATE)) - Math.round(base);
    const total = base + gst;
    const intra = isIntraState(tx.customer_gstin, tx.customer_state);
    const half = Math.round((gst / 2) * 100) / 100;
    const receiptNo = tx.provider_payment_id || tx.provider_ref || tx.id;
    const dateStr = new Date(tx.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

    // ── Render PDF ──────────────────────────────────────────────────────
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const L = 48;
    let y = 56;

    doc.setFont("helvetica", "bold").setFontSize(18);
    doc.text("Payment Receipt", L, y);
    y += 26;

    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(SELLER.name, L, y); y += 15;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    doc.text(SELLER.address, L, y); y += 13;
    doc.text(`GSTIN: ${SELLER.gstin}`, L, y); y += 13;
    doc.text(`State: ${SELLER.stateName} (${SELLER.stateCode})`, L, y); y += 13;
    doc.text(`SAC: ${SELLER.sac}`, L, y);

    // Right-aligned meta
    const R = 400;
    let ry = 82;
    doc.setFontSize(9.5);
    doc.text(`Receipt No: ${receiptNo}`, R, ry); ry += 13;
    doc.text(`Date: ${dateStr}`, R, ry);

    y += 26;
    doc.setDrawColor(200).line(L, y, 547, y); y += 22;

    // Bill to
    doc.setFont("helvetica", "bold").setFontSize(10.5);
    doc.text("Billed to", L, y); y += 15;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    doc.text(prof?.full_name || prof?.email || "Customer", L, y); y += 13;
    if (prof?.email) { doc.text(prof.email, L, y); y += 13; }
    if (tx.customer_gstin) { doc.text(`GSTIN: ${tx.customer_gstin}`, L, y); y += 13; }
    if (tx.customer_state) { doc.text(`Place of supply: ${tx.customer_state}`, L, y); y += 13; }

    y += 12;
    doc.setDrawColor(200).line(L, y, 547, y); y += 22;

    // Line item
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text("Description", L, y);
    doc.text("Amount", 480, y, { align: "right" });
    y += 8;
    doc.setDrawColor(220).line(L, y, 547, y); y += 18;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    doc.text(`${tx.credits_added} credits (Swarnix Studio)  ·  SAC ${SELLER.sac}`, L, y);
    doc.text(money(base), 480, y, { align: "right" });
    y += 22;

    // Tax rows
    const row = (label: string, val: string) => {
      doc.text(label, 300, y);
      doc.text(val, 480, y, { align: "right" });
      y += 16;
    };
    doc.text("Taxable value", 300, y); doc.text(money(base), 480, y, { align: "right" }); y += 16;
    if (intra) {
      row("CGST @ 9%", money(half));
      row("SGST @ 9%", money(gst - half));
    } else {
      row("IGST @ 18%", money(gst));
    }
    doc.setDrawColor(220).line(300, y - 4, 547, y - 4); y += 4;
    doc.setFont("helvetica", "bold").setFontSize(10.5);
    doc.text("Total paid", 300, y); doc.text(money(total), 480, y, { align: "right" });

    y += 40;
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(120);
    doc.text("This is a computer-generated payment receipt and does not require a signature.", L, y); y += 12;
    doc.text("Payment processed securely via Razorpay. Credits are non-refundable and never expire.", L, y);

    const bytes = doc.output("arraybuffer");
    return new Response(bytes, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${receiptNo}.pdf"`,
      },
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
