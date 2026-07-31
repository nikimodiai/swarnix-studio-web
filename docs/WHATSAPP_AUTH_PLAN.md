# WhatsApp OTP Login — Implementation Plan

**Project:** `swarnix-studio-web` (Vite + React, Vercel)
**Supabase project:** `bigmdvjrvqyqzyrijdum` (shared with Swarnix app + mobile studio)
**Written:** 2026-07-31
**Status:** PLAN ONLY — no code written yet.

---

## 0. Goal & the one hard constraint

Add **WhatsApp OTP login alongside Google OAuth**, with the OTP delivered from
**Swarnix's own WABA number** (the same number that runs the customer-facing AI
agent), so we can nudge new jewellers to message that number and experience the
agent for themselves.

**The hard constraint that shapes everything below:**

> Supabase's phone provider creates a **new `auth.users` row with a new uuid**.
> Every `app_*` table in this project keys off `user_id = auth.uid()`.
> Therefore a naive "add phone provider" ships a bug where a Google user who
> later logs in by WhatsApp gets a **second account** — separate credits,
> separate gallery, separate purchase history.

Verified against the live DB (2026-07-31):

- All 11 existing `auth.users` are `provider: google`; **`auth.users.phone` is
  `null` for every one of them**. So there is no existing phone data to migrate
  and no existing collision to clean up — we are starting clean.
- `app_profiles.id` **is** the uid. `app_profiles.store_phone` exists but is
  free-text profile data (used for poster branding), **not** a verified identity
  — do not treat it as one.
- Tables keyed on `user_id`: `app_gallery`, `app_designs`, `app_transactions`,
  `app_tryon_jobs`, `app_batches`, `app_batch_items`, `app_collections`,
  `app_generation_events`, `app_scheme_*`, `reel_jobs`.
  `app_referrals` uses `referrer_id` / `referred_id` → `app_profiles`.
  `app_owner_metal_rates` uses `owner_id`.

**Schema impact: none of these change.** The uid stays the uid; RLS stays as-is.
All the work is in *identity linking* + *OTP delivery* + *abuse control*.

---

## 1. What Meta will and will not allow

### Will allow
- A template in category **`AUTHENTICATION`**, type **copy-code**. Approval is
  usually fast (minutes–hours) because the copy is drawn from Meta's fixed
  authentication strings — you supply only the code variable.
- Sending that template to any number, user-initiated or not.

### Will NOT allow
- **Custom marketing text inside the authentication template.** Authentication
  templates permit exactly one variable (the code) and forbid URLs, media, and
  extra body copy. **The "say Hi to try our AI agent" nudge cannot live in the
  OTP message.** Meta rejects this specifically to stop marketing piggybacking
  on auth traffic.
- One-tap autofill is Android-app-only (needs an app signing hash) — irrelevant
  for a web app. **Use copy-code.**

### Cost
Authentication conversations are billed **per message** in India — budget
roughly **₹0.10–0.15 per OTP**. Not free, which means unthrottled OTP requests
are a direct cash burn. Rate limiting (§5) is not optional.

### Quality-rating risk
The OTP number is the **same number running the customer AI agent**. If its
quality rating drops (blocks/reports from unwanted messages), that jeopardises a
business-critical asset. This is the reason the nudge stays in-app (§4) rather
than becoming a second template send.

---

## 2. Delivery: Supabase Auth Hook → Meta Cloud API

Supabase's built-in phone provider supports WhatsApp only via **Twilio Verify**,
which would send from **Twilio's** number — a stranger's number, which makes the
"message this same number" nudge incoherent. So:

**Use the Send-SMS Auth Hook.** Supabase generates and validates the OTP; our
hook is responsible only for delivery.

```
Client: signInWithOtp({ phone, channel: 'whatsapp' })
   ↓
Supabase Auth  — generates OTP, stores hash, enforces expiry
   ↓  (Send-SMS hook, HMAC-signed webhook)
Edge Function `send-whatsapp-otp`
   ↓  POST graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
Meta Cloud API → user's WhatsApp (from the Swarnix number)
   ↓
Client: verifyOtp({ phone, token, type: 'sms' })  → session
```

**Why an edge function and not n8n:** the hook is a signed, latency-sensitive,
secret-bearing call in the auth path. It belongs next to
`create-razorpay-order` / `generate-receipt` in `supabase/functions/`, with the
WABA token in Supabase secrets — not in an n8n workflow where the token would
sit in a credential shared with the marketing flows.

**Note:** even with the hook, `verifyOtp({ type: 'sms' })` is correct — the hook
replaces the *transport*, not the OTP lifecycle.

### New edge function: `supabase/functions/send-whatsapp-otp/index.ts`
- Verify the hook's HMAC signature (`SEND_SMS_HOOK_SECRET`) — reject unsigned
  calls. Without this, anyone who finds the URL can make us send WhatsApp
  messages on our bill.
- Read `{ user, sms: { otp } }` from the payload.
- Normalise the phone to E.164 digits (no `+`) for the Graph API.
- POST the `AUTHENTICATION` template with the OTP as the body variable **and**
  as the copy-code button parameter (Meta requires both for copy-code).
- Return non-2xx on Meta failure so Supabase surfaces a real error to the client
  instead of the user waiting for a code that never arrives.
- **Never log the OTP.** Log `{ user_id, masked_phone, meta_message_id, status }`
  only.

Secrets to set: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_OTP_TEMPLATE_NAME`,
`SEND_SMS_HOOK_SECRET`.

---

## 3. Identity model — the core of the work

**Rule: phone is a login method attached to a user. It is never an implicit
second account.**

### 3a. Link phone to an existing (Google) account — build this first
Signed-in user supplies a number:
```js
await db.auth.updateUser({ phone });                       // sends OTP via our hook
await db.auth.verifyOtp({ phone, token, type: 'phone_change' });
```
This writes `auth.users.phone` on the **existing uid**. From then on
`signInWithOtp({ phone })` resolves to that same uid — one account, one balance.

Note the type is **`phone_change`**, not `sms`. Using `sms` here is the classic
mistake and it fails.

### 3b. Phone-first signup
Unknown number → Supabase creates a new user with a new uid. `loadProfile()` in
[`src/hooks/useAuth.jsx`](../src/hooks/useAuth.jsx) upserts `app_profiles`
normally. Two adjustments needed there:

- `email` will be `null` for phone-first users. The upsert already tolerates
  null, but check any UI that assumes `profile.email` exists.
- Seed `app_profiles.store_phone` from the verified phone on first create — it's
  the poster-branding field and this saves the jeweller typing it.

### 3c. The merge case — handle by prevention, not by auto-merge
A user who signed up by phone, then later clicks "Continue with Google" with an
email we've never seen, produces a second account. **Do not auto-merge**:
there's no shared verified identifier, and merging on unverified data is an
account-takeover vector.

Mitigations, in order:
1. **Prompt for the phone at Google signup** when `auth.users.phone` is null
   (dismissible, re-asked once). This is what actually prevents the split.
2. **Prompt for email/Google link after phone-first signup**, via
   `db.auth.linkIdentity({ provider: 'google' })` — attaches Google to the
   *existing* uid.
3. If a duplicate still happens, treat it as **manual support**: an admin-run
   merge, audited. Deliberately not self-serve in v1.

### 3d. Migration: `supabase/migrations/whatsapp_auth.sql`
No changes to existing tables. Adds:

- `app_profiles.phone_verified_at timestamptz` — denormalised flag so the client
  can render "verified" without reading `auth.users`.
- `app_phone_grants (phone_e164 text primary key, first_user_id uuid, granted_at
  timestamptz)` — the free-credit anti-abuse ledger (§5). Keyed by **phone**,
  not user, deliberately: that's the whole point.
- `app_account_merges (id, from_user_id, to_user_id, merged_by, merged_at,
  note)` — audit table for §3c case 3. Empty in v1; exists so a manual merge is
  recorded rather than silently done in the SQL console.
- RLS: `app_phone_grants` and `app_account_merges` are **service-role only** —
  no client policies. Clients must not be able to read who owns which number.
- `app_claim_phone_grant()` — `security definer` RPC, follows the
  `app_record_referral` pattern (returns a status string: `'granted'` |
  `'already_used'` | `'no_phone'`), called after profile upsert.

---

## 4. The nudge — placement and frequency

**Not in the OTP template** (§1). Three legal placements; build #1 in v1.

### 4.1 In-app card after login — build this
A dismissible card on the Studio Suite hub:

> **That OTP came from our AI number.**
> Say "Hi" to it and see the assistant your customers would chat with — it
> answers in Hindi, Gujarati, Marathi and more.
> `[Open WhatsApp]` → `https://wa.me/917506407254?text=Hi`

Free, zero Meta risk, and it's where the pitch actually lands.

**Honest-framing caveat:** the OTP number is the **Swarnix** WABA, so a jeweller
messaging it talks to *Swarnix's* agent — not a preview of their own store's
agent with their own inventory. Word it as "see how the AI agent works", **not**
"this is your customers browsing your inventory". The latter overpromises and
the demo will underdeliver.

### 4.2 Frequency: first-time only, with one re-nudge
Show until either (a) they've messaged the number, or (b) they've dismissed it
twice — then never again. Every-login nudging trains people to ignore it and
makes the product feel spammy.

State: `localStorage` counter for dismissals (v1, cheap). If we later want it
cross-device, promote to an `app_profiles.nudge_state jsonb` column.

"Have they messaged us" is not knowable client-side; treat the dismissal count
as the practical signal in v1.

### 4.3 Deferred (not v1)
- A separate **Marketing** template a few minutes post-signup (~₹0.78/send,
  needs its own approval + opt-in basis).
- Reacting to an inbound "Hi" in the existing agent workflow with a
  Studio-specific greeting.

---

## 5. Abuse control — do not skip this

Phone signup is **cheaper to farm than Google signup** (a burner SIM beats a
burner Gmail), and every free signup grants credits that cost us GPU spend. Two
separate leaks:

### 5.1 Free credits — bind the grant to the phone
`free_tryons_used` is per-uid today, so a farmed phone signup = free credits.
Fix: on profile create, call `app_claim_phone_grant()`. If the E.164 number is
already in `app_phone_grants`, the new account starts with **0** free credits
instead of the default quota. This reuses the intent behind `signup_fingerprint`
(already used for referral self-abuse) but keys on something much harder to
rotate.

**Also close the referral interaction:** phone-first accounts must not be able
to claim referral rewards on a number that already claimed one, or the referral
program becomes the farm target instead. `app_record_referral` should consult
the same grant ledger.

### 5.2 OTP sends — rate limit before Meta is called
In the edge function, before the Graph call:
- max **3 sends per phone per hour**, **10 per day**;
- max **20 per IP per hour**;
- 60s minimum between sends to the same number (client shows a resend timer).

Return 429 on breach. Cheapest durable store is a small
`app_otp_throttle (phone_e164, window_start, count)` table written by the
function's service-role client.

### 5.3 Also configure
- Supabase Auth → enable Phone provider, **disable phone signups** only if we
  want link-only mode during rollout (see §7 Stage 2 gate).
- Keep Supabase's own OTP expiry short (default 60s–10min; **use 10 min** — WhatsApp
  delivery can lag and a too-short expiry generates re-sends, which cost money).

---

## 6. Files touched

**New**
| Path | Purpose |
|---|---|
| `supabase/functions/send-whatsapp-otp/index.ts` | Auth hook → Meta Cloud API |
| `supabase/migrations/whatsapp_auth.sql` | grants/merges/throttle tables + RPC |
| `src/components/PhoneOtpForm.jsx` | number entry → OTP entry → verify (shared by login + link) |
| `src/components/WhatsAppNudge.jsx` (+ `.module.css`) | the §4 card |
| `src/components/LinkPhoneCard.jsx` | "add your WhatsApp number" prompt for Google users |
| `src/lib/phone.js` | E.164 normalisation, default +91, masking for logs/UI |

**Modified**
| Path | Change |
|---|---|
| `src/pages/Login.jsx` | add "Continue with WhatsApp" beside the existing Google button; keep Google visually primary |
| `src/hooks/useAuth.jsx` | `signInWithOtp` / `verifyOtp` / `linkPhone`; tolerate null email; call `app_claim_phone_grant` after upsert (same terminal-vs-transient retry discipline as `maybeRecordReferral`) |
| `src/pages/StudioSuite.jsx` | mount `<WhatsAppNudge />` + `<LinkPhoneCard />` |
| `src/lib/config.js` | `SWARNIX_WA_NUMBER` for the `wa.me` link |
| `docs/` | this file |

**External / manual (not code)**
- Meta Business Manager: create + submit the `AUTHENTICATION` copy-code template.
- Supabase dashboard: enable Phone provider, register the Send-SMS hook URL,
  set the four secrets, set OTP expiry.

---

## 7. Build order

**Stage 1 — Link phone to existing account.**
Migration + edge function + `PhoneOtpForm` + `LinkPhoneCard`. No new login path
yet, so **no possibility of duplicate accounts**. Proves the Meta template, the
hook, and the OTP round-trip against real users. Seeds verified phones.

**Stage 2 — WhatsApp as a login method.**
Enable phone signups, add the Login button, wire `app_claim_phone_grant` and the
throttle. Gate: Stage 1 must show a healthy delivery rate first.

**Stage 3 — Nudge.**
`WhatsAppNudge` on the hub. Independent of 1–2; ship whenever.

**Explicitly out of scope for v1:** self-serve account merge, the marketing-
template nudge, one-tap autofill, and any change to the mobile app or the
Swarnix owner app (they share `auth.users`, so Stage 1 benefits them for free,
but their UI is untouched).

---

## 8. Open items to confirm before building

1. **Is `+91 7506407254` the WABA that will send OTPs**, and is it the same
   number the customer agent runs on? The whole nudge premise depends on yes.
   (Number taken from `Swarnix site/karat-site.jsx:48`.)
2. **Free-credit count is inconsistent.** `Login.jsx:64` advertises **10 free
   credits**; `useAuth.jsx:98` defaults `freeQuota` to **3** pending the
   `app_pricing.free_quota` read. Worth reconciling — a phone signup flow will
   put this copy in front of more new users.
3. **India-only, or international?** Affects phone normalisation defaults and
   Meta's per-corridor auth pricing.
