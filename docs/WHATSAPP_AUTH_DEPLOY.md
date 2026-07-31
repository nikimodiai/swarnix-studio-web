# WhatsApp OTP Login — Deployment Runbook

Companion to [WHATSAPP_AUTH_PLAN.md](./WHATSAPP_AUTH_PLAN.md). The **code is
written and the migration is applied**; everything below is external config that
can only be done from the Meta and Supabase dashboards.

**Order matters.** The edge function fails closed without its secrets, and the
Auth Hook will start calling it the moment the Phone provider is enabled — so
enable the provider *last*.

---

## Status

| Piece | State |
|---|---|
| Migration `whatsapp_auth.sql` | ✅ applied to prod (`bigmdvjrvqyqzyrijdum`) |
| `app_record_referral` → v6 | ✅ applied (adds `phone_already_granted` block) |
| Client code (login, link, nudge) | ✅ written, `npm run build` clean |
| Edge function `send-whatsapp-otp` | ⬜ **written but NOT deployed** — needs secrets first |
| Meta AUTHENTICATION template | ⬜ not created |
| Supabase Phone provider + hook | ⬜ not enabled |

Verified post-migration: `verified_phones = 0`, `grants = 0`,
`app_phone_already_granted` false for all existing users — **no existing
Google user is affected** by any of this until they link a number.

---

## Step 1 — Create the Meta template

Meta Business Manager → WhatsApp Manager → Message Templates → **Create**.

- **Category:** `Authentication` (NOT Marketing/Utility — the others get
  rejected for OTP use, and Utility can't carry a copy-code button)
- **Type:** Copy code
- **Name:** e.g. `swarnix_login_code` — whatever you choose goes in
  `WA_OTP_TEMPLATE_NAME`
- **Language:** English → `WA_OTP_TEMPLATE_LANG=en` (use `en_US` if that's what
  Meta assigns; the code must match exactly or the send 400s)
- **Code expiration:** 10 minutes, to match the Supabase OTP expiry in Step 4

Body copy is **fixed by Meta** — you cannot add "say Hi to try our AI agent"
here. That nudge lives in-app; see `src/components/WhatsAppNudge.jsx`.

Wait for **Approved** before continuing.

---

## Step 2 — Generate the hook secret

Supabase Dashboard → Authentication → Hooks → **Send SMS hook** → generate a
secret. It looks like `v1,whsec_<base64>`.

Copy it — you need it in Step 3, and it's shown once.

---

## Step 3 — Set secrets, then deploy the function

Dashboard → Edge Functions → Secrets (or `supabase secrets set`):

| Secret | Value |
|---|---|
| `WA_PHONE_NUMBER_ID` | Meta phone number ID for +91 7506407254 |
| `WA_ACCESS_TOKEN` | System-user token, `whatsapp_business_messaging` scope |
| `WA_OTP_TEMPLATE_NAME` | from Step 1 |
| `WA_OTP_TEMPLATE_LANG` | `en` (or whatever Step 1 assigned) |
| `SEND_SMS_HOOK_SECRET` | from Step 2, **including** the `v1,whsec_` prefix |

Use a **long-lived system-user token**, not a 24-hour user token — the latter
will silently expire and break login.

Then deploy **with JWT verification off**:

```bash
supabase functions deploy send-whatsapp-otp --no-verify-jwt
```

`--no-verify-jwt` is required and is **not** a security hole here: auth hooks are
not called with a user JWT (the user has no session yet at OTP time). The
function verifies the standardwebhooks HMAC signature itself and returns 401 on
mismatch, and it refuses to start if `SEND_SMS_HOOK_SECRET` is unset.

---

## Step 4 — Enable the Phone provider

Dashboard → Authentication → Providers → **Phone**:

- Enable phone provider: **on**
- SMS provider: any (the hook overrides delivery; it just can't be blank)
- **Enable phone confirmations: on**
- **OTP expiry: 600 seconds (10 min).** Do not shorten this — WhatsApp delivery
  can lag, and a too-short expiry generates resends, each of which costs money.
- OTP length: 6 (the client's `CODE_LENGTH` assumes 6)

Then Authentication → Hooks → **Send SMS hook**: point it at the deployed
function URL and enable it.

---

## Step 5 — Verify

1. **Link flow first** (safest — no new account can be created):
   sign in with Google → hub shows "Add your WhatsApp number" → enter number →
   code arrives from +91 7506407254 → verify → card flips to "linked".
   Then check:
   ```sql
   select id, phone, phone_confirmed_at is not null as verified from auth.users
   where phone is not null;
   select * from public.app_phone_grants;
   ```
   Expect one `auth.users` row with your existing uid (**not** a new one) and one
   grant row.

2. **Login flow:** sign out → "Continue with WhatsApp" → same number → you must
   land back in the **same account** with credits and Library intact.

3. **Throttle:** request 4 codes to the same number inside an hour. The 4th
   returns 429 and `app_otp_throttle` shows the counter.

4. **Recycled-number guard:** not testable without a second number; the logic is
   `app_claim_phone_grant` returning `'already_used'`.

---

## Rollback

Disable the **Send SMS hook** and the **Phone provider** in the dashboard. The
client degrades cleanly: Google login is untouched, and `LinkPhoneCard` /
`PhoneOtpForm` simply error if used. No migration rollback is needed — the new
tables are additive and unread when the feature is off.

The one thing that persists is `app_record_referral` v6. It's a no-op while
`app_phone_grants` is empty, so it can be left in place.

---

## Cost & monitoring

- **~₹0.10–0.15 per OTP** (Meta authentication conversation, India).
- Throttle caps exposure at 10/number/day and 20/IP/hour.
- Watch the WABA **quality rating** in WhatsApp Manager after go-live. This
  number also runs the customer AI agent; a rating drop there is a business
  problem, not just a login problem. If it dips, tighten the throttle rather
  than accepting the drift.
- Function logs record `masked_phone`, `user_id`, `meta_message_id`, status —
  **never the OTP**.
