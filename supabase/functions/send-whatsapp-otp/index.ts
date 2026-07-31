// send-whatsapp-otp
// Supabase "Send SMS" Auth Hook → Meta WhatsApp Cloud API.
//
// Supabase Auth owns the OTP lifecycle (generation, hashing, expiry,
// verification). This function owns DELIVERY only: it receives the generated
// code and sends it from the Swarnix WABA (+91 7506407254) — the same number
// that runs the customer-facing AI agent, which is the whole point: the jeweller
// receives the OTP from a number they're then nudged to message.
//
// Auth: this is a HOOK, not a user-facing endpoint. It is NOT called with a user
// JWT, so `verify_jwt` MUST be false in config; the HMAC signature check below
// is what secures it. Without that check anyone who finds the URL could make us
// send WhatsApp messages on our bill.
//
// Meta constraint: the template must be category AUTHENTICATION, type copy-code.
// Those templates allow exactly ONE variable (the code) and forbid URLs, media
// and custom marketing copy — so the "say Hi to our AI agent" nudge CANNOT ride
// along here. It lives in-app (see src/components/WhatsAppNudge.jsx).
//
// Secrets required:
//   WA_PHONE_NUMBER_ID     Meta phone number id (the sender)
//   WA_ACCESS_TOKEN        Meta system-user token with whatsapp_business_messaging
//   WA_OTP_TEMPLATE_NAME   approved AUTHENTICATION template name
//   WA_OTP_TEMPLATE_LANG   template language code (default en)
//   SEND_SMS_HOOK_SECRET   from Supabase Auth Hooks ("v1,whsec_<base64>")

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// Rate limits. OTPs cost real money (~₹0.10-0.15 each in India), so an
// unthrottled loop is a direct cash burn, not just an abuse vector.
const MAX_PER_PHONE_HOUR = 3;
const MAX_PER_PHONE_DAY = 10;
const MAX_PER_IP_HOUR = 20;
const MIN_RESEND_SECONDS = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Never log a raw number. +919876543210 → +9198*****10
function maskPhone(p: string) {
  if (p.length < 6) return "***";
  return `${p.slice(0, 5)}*****${p.slice(-2)}`;
}

// Meta wants digits only, no leading '+'. Supabase hands us E.164 without the
// '+' already in most cases; strip defensively either way.
function toGraphNumber(p: string) {
  return p.replace(/[^\d]/g, "");
}

type ThrottleRow = { scope: string; window_start: string; count: number; last_sent_at: string | null };

// One throttle bucket = (scope, truncated window). Read-modify-write on a tiny
// table; contention is irrelevant at this volume and a slight undercount on a
// race is harmless (the day/resend limits still bound it).
async function checkAndBump(
  admin: ReturnType<typeof createClient>,
  scope: string,
  windowMs: number,
  max: number,
  enforceResendGap: boolean,
): Promise<{ ok: true } | { ok: false; reason: string; retryAfter: number }> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();

  const { data } = await admin
    .from("app_otp_throttle")
    .select("scope, window_start, count, last_sent_at")
    .eq("scope", scope)
    .eq("window_start", windowStart)
    .maybeSingle();

  const row = data as ThrottleRow | null;

  if (row) {
    if (enforceResendGap && row.last_sent_at) {
      const since = (now - new Date(row.last_sent_at).getTime()) / 1000;
      if (since < MIN_RESEND_SECONDS) {
        return { ok: false, reason: "too_soon", retryAfter: Math.ceil(MIN_RESEND_SECONDS - since) };
      }
    }
    if (row.count >= max) {
      const resetIn = Math.ceil((new Date(windowStart).getTime() + windowMs - now) / 1000);
      return { ok: false, reason: "rate_limited", retryAfter: resetIn };
    }
  }

  await admin.from("app_otp_throttle").upsert(
    {
      scope,
      window_start: windowStart,
      count: (row?.count ?? 0) + 1,
      last_sent_at: new Date(now).toISOString(),
    },
    { onConflict: "scope,window_start" },
  );

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const phoneNumberId = Deno.env.get("WA_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("WA_ACCESS_TOKEN");
  const templateName = Deno.env.get("WA_OTP_TEMPLATE_NAME");
  const templateLang = Deno.env.get("WA_OTP_TEMPLATE_LANG") ?? "en";
  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");

  if (!phoneNumberId || !accessToken || !templateName) {
    console.error("send-whatsapp-otp: WABA env not configured");
    return json({ error: "WhatsApp sender not configured" }, 500);
  }
  if (!hookSecret) {
    // Fail closed. An unsigned hook endpoint is an open relay for our WABA.
    console.error("send-whatsapp-otp: SEND_SMS_HOOK_SECRET missing");
    return json({ error: "Hook secret not configured" }, 500);
  }

  const raw = await req.text();

  // ── Verify the hook signature ──────────────────────────────────────
  // Supabase signs with the standardwebhooks scheme. The secret is stored as
  // "v1,whsec_..."; the library wants the bare base64 part.
  let payload: {
    user?: { id?: string; phone?: string };
    sms?: { otp?: string };
  };
  try {
    const wh = new Webhook(hookSecret.replace(/^v1,\s*/, "").replace(/^whsec_/, ""));
    payload = wh.verify(raw, {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    }) as typeof payload;
  } catch (e) {
    console.error("send-whatsapp-otp: signature verification failed", String(e));
    return json({ error: "Invalid signature" }, 401);
  }

  const phone = payload?.user?.phone ?? "";
  const otp = payload?.sms?.otp ?? "";
  const userId = payload?.user?.id ?? null;

  if (!phone || !otp) {
    return json({ error: "Missing phone or otp in hook payload" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Throttle BEFORE calling Meta, so abuse costs us nothing ────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  const checks = [
    await checkAndBump(admin, `phone:${phone}`, hour, MAX_PER_PHONE_HOUR, true),
    await checkAndBump(admin, `phoneday:${phone}`, day, MAX_PER_PHONE_DAY, false),
    await checkAndBump(admin, `ip:${ip}`, hour, MAX_PER_IP_HOUR, false),
  ];
  const blocked = checks.find((c) => !c.ok);
  if (blocked && !blocked.ok) {
    console.warn(
      `send-whatsapp-otp: blocked ${maskPhone(phone)} reason=${blocked.reason}`,
    );
    return new Response(
      JSON.stringify({
        error:
          blocked.reason === "too_soon"
            ? `Please wait ${blocked.retryAfter}s before requesting another code.`
            : "Too many code requests. Please try again later.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(blocked.retryAfter) },
      },
    );
  }

  // ── Send the AUTHENTICATION template ───────────────────────────────
  // Copy-code templates need the OTP in BOTH the body variable and the button
  // parameter; Meta rejects the send if the button copy value is missing.
  const graphUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toGraphNumber(phone),
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        { type: "body", parameters: [{ type: "text", text: otp }] },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };

  let resp: Response;
  try {
    resp = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("send-whatsapp-otp: network error calling Meta", String(e));
    return json({ error: "Could not reach WhatsApp. Please try again." }, 502);
  }

  const result = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    // Surface a non-2xx so Supabase reports a real error to the client instead
    // of the user waiting for a code that will never arrive.
    console.error(
      `send-whatsapp-otp: Meta rejected send to ${maskPhone(phone)}`,
      JSON.stringify(result?.error ?? result),
    );
    return json(
      { error: result?.error?.message ?? "WhatsApp delivery failed" },
      502,
    );
  }

  // Log delivery metadata ONLY — never the OTP.
  console.log(
    `send-whatsapp-otp: sent to ${maskPhone(phone)} user=${userId ?? "new"} msg=${
      result?.messages?.[0]?.id ?? "?"
    }`,
  );

  return json({ success: true });
});
