# Swarnix Studio — Build PRD

**Owner:** Nikhil, Nelishka AI Solutions
**Target agent:** Antigravity IDE with Claude Code
**Deadline driver:** IIFJAS Mumbai trade exhibition, August 2026
**Date:** 31 July 2026

---

## 0. Instructions to the coding agent

Read this whole document before writing any code.

This is an existing, working, revenue-ready application. You are extending it, not rebuilding it.

**Hard constraints — do not violate these:**

1. **Do not refactor working features.** The referral system, the catalog builder, the media library, and the aspect-ratio selector are built and working. Touch them only where this document explicitly says to.
2. **Do not change the auth provider.** Google auth via Supabase Auth stays exactly as it is. Item 3 adds a field, not a login method.
3. **All migrations are additive.** New tables and new nullable columns only. No destructive `ALTER`, no column renames, no dropped constraints. Every migration must be runnable against a live production database with paying users on it.
4. **RLS on every new table**, following the existing multi-tenant isolation pattern. No table ships without a policy.
5. **No new paid third-party services.** Everything here must be built with the stack listed in section 1.
6. **This codebase is maintained by one person part-time.** Choose the boring implementation. Fewer moving parts beats elegant abstraction. If a feature needs a background worker, use the existing n8n instance rather than introducing a new queue system.
7. **Before writing any migration, read the actual schema.** Table and column names in this document are my best description, not verified DDL. Confirm real names first and adapt. Never invent a column that already exists under a different name.
8. **Ask before assuming on money.** Anything touching credit balances, Razorpay, or GST — if the existing implementation contradicts this document, stop and flag it rather than "fixing" it.

**Writing style for code and comments:** keep explanations clear and direct. Comment like a developer explaining a decision to the person who will debug it at 2am, not like documentation software.

---

## 1. Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion |
| Hosting | Vercel |
| Database / Auth | Supabase (Postgres, RLS, Google OAuth) |
| Media storage & transforms | Cloudinary |
| Image generation | Gemini 2.5 Flash Image via Vertex AI (GCP project `gen-lang-client-0072450422`) |
| Video generation | Seedance 1.5 Pro via BytePlus, stitched with ffmpeg |
| Payments | Razorpay |
| Messaging | Meta WhatsApp Business API (Tech Provider, Embedded Signup) |
| Orchestration / background jobs | Self-hosted n8n |

---

## 2. Product context (read this, it explains the "why")

Studio sells AI jewellery imagery to Indian jewellers on prepaid credits. Current state:

- Google login, Razorpay credit packs, 1 credit = 1 image generation
- 3 free credits on signup
- Packs: ₹149 / 10 credits, up to ₹1,000 / 100 credits, all **exclusive of GST**
- Cost base: ~₹5 per image generation (₹3.99 Gemini + ₹1 VPS)
- Reels: 4-second SD from Seedance, sold from ₹20
- Built and working: catalog builder (photos + prices, share to WhatsApp), media library with download/share, multiple aspect ratios, refer-and-earn (referrer and referee each get 10 credits when the referee buys ≥₹399)

Competitors sell the same outputs at ₹33/photo with 20 free credits. The buyer is a tech-resistant, WhatsApp-native Indian jeweller who converts on peer proof, not price. Every item below exists to fix one of three problems: **trial conversion, repeat purchase, or margin.**

---

## 3. Work items

Seven items, grouped by priority. Ship P0 before the August exhibition.

---

### P0-1 — Pricing and packaging rework

**Problem:** the pack ladder gives volume buyers the worst margin (50% at ₹10/credit against a ₹5 cost), the checkout total jumps from ₹149 to ₹175.82 once GST is added, and pure credit packs guarantee one-shot buying with no reason to return.

**Scope:**

1. **Flatten the credit ladder.** Replace current packs with:

   | Pack | Ex-GST price | Credits | ₹/credit | Customer pays (incl. 18% GST) |
   |---|---|---|---|---|
   | Trial | ₹127 | 10 | ₹12.70 | ₹149 |
   | Standard | ₹424 | 35 | ₹12.11 | ₹499 |
   | Bulk | ₹847 | 75 | ₹11.29 | ₹999 |

   Ex-GST prices are chosen so the customer-facing total lands on a round number. Credit counts are the tuning variable — adjust them if I change the ₹/credit floor, but **never price a credit below ₹11**.

2. **Add a monthly subscription tier.** ₹847/month ex-GST (₹1,000 incl.), 100 credits per month, unused credits roll over 30 days then expire. Razorpay Subscriptions, auto-debit, cancel any time. This is the retention product — the credit packs exist to feed it.

3. **Pricing page display.** Show the **GST-inclusive** number as the large primary price, with `+18% GST included` in small text beneath, and the ex-GST figure in the invoice only. The checkout total must equal the number shown on the pricing card. No surprises at the Razorpay screen.

4. **Referral interaction:** the ≥₹399 referral qualification threshold is ex-GST. Confirm the existing referral check reads the ex-GST amount, not the Razorpay gross. If it reads gross, a ₹424 Standard pack qualifies either way, but a future ₹350 pack would silently qualify by accident. Fix the comparison to be explicit about which figure it uses.

**Out of scope:** discount codes, annual plans, GST invoicing automation.

**Acceptance criteria:**
- [ ] A logged-out visitor sees three packs and one subscription, each showing the inclusive price prominently
- [ ] Razorpay checkout total matches the displayed inclusive price to the rupee
- [ ] Subscription renews, grants 100 credits on renewal, and expires rolled-over credits at 30 days
- [ ] Existing users' current credit balances are untouched by the migration
- [ ] Referral qualification still fires correctly on the new pack prices

---

### P0-2 — Free credit grant: 3 → 10, watermarked

**Problem:** three credits is a coin flip. If a new user's first two generations miss, they leave believing the product is broken. Competitors give 20. But 10 free credits at ₹5 each is ₹50 of real cost per signup, so the grant needs abuse protection and a reason to convert.

**Scope:**

1. Raise the signup grant from 3 to **10 credits**.
2. **Outputs generated from free credits carry a visible watermark.** Reuse the existing Cloudinary watermarking pipeline. The watermark must be clearly visible but must not obscure the piece — the user has to be able to judge the quality. Bottom-right corner, semi-transparent, "Swarnix Studio".
3. Clean, full-resolution downloads unlock on first paid purchase — and **retroactively**, for everything they generated on free credits. This is the conversion mechanic: they have already produced 10 images they want, and ₹150 releases all of them.
4. **One grant per verified WhatsApp number** (see P0-3). Grant on number verification, not on account creation. A user who signs up but skips the number gets 3 credits, unwatermarked flow unchanged, and a persistent prompt to verify for 7 more.
5. **Credits granted by the referral system are paid-grade**, not free-grade — referral credits must produce clean, unwatermarked output. Do not route them through the free-grant path.

**Data model:** credits need a grade. Add `credit_grade` (`'free' | 'paid'`) to whatever table holds credit ledger entries, defaulting existing rows to `'paid'` so no current user is retroactively watermarked. Generation records store the grade of the credit that paid for them.

**Acceptance criteria:**
- [ ] Existing users see no change to their balance or their past downloads
- [ ] New signup with verified number receives exactly 10 free credits, once, ever
- [ ] Free-credit outputs are watermarked in the library, in downloads, and in WhatsApp delivery
- [ ] After any paid purchase, every previously watermarked output becomes downloadable clean
- [ ] Referral credits produce unwatermarked output
- [ ] A second account on the same WhatsApp number receives zero free credits

---

### P0-3 — WhatsApp number capture and delivery

**Problem:** Google auth gives an email address for a buyer whose entire business runs on WhatsApp. Email is a dead channel here. And delivery-to-WhatsApp is the one capability no competitor can copy quickly, because it needs a Meta Tech Provider registration.

**Scope:**

1. After first Google login, a required one-step screen: WhatsApp number (+91 default, other country codes allowed). Not skippable to reach the generator — but see the 3-credit fallback in P0-2 if I later decide to soften this.
2. Verify by sending the number a WhatsApp message via the existing Business API with a 6-digit code. **No SMS, no third-party OTP service.** Verification via WhatsApp is nearly free, self-validates the channel, and confirms the number is actually on WhatsApp.
3. On every completed generation, deliver the output to the verified number as a WhatsApp media message alongside the existing in-app result. Include the SKU or piece name if the user has set one.
4. Add a per-user toggle: deliver to WhatsApp always / only when I tap Send / never. Default to always.
5. Store the number on the user record for later re-marketing. This is the strategic point of the whole item.

**Rate and cost note:** WhatsApp delivery is billed per conversation by Meta. Batch a user's outputs into a single delivery where they were generated together (see P1-1) rather than one message per image.

**Acceptance criteria:**
- [ ] Number is captured, verified, and stored, with country code normalised to E.164
- [ ] Verification code arrives on WhatsApp within 30 seconds
- [ ] A wrong or non-WhatsApp number fails cleanly with a retry, not a stuck screen
- [ ] Generated images arrive on WhatsApp at full quality, watermarked or clean per credit grade
- [ ] Delivery preference is respected
- [ ] Existing users are prompted once on next login, and can dismiss it twice before it becomes blocking

---

### P0-4 — Generation analytics

**Problem:** I do not know my first-pass accept rate, and I cannot price or market honestly without it. I also need repeat-purchase rate, which is the single number that decides whether Studio stays a standalone product.

**Scope:**

Create a `generation_events` table (or extend the existing generation log) capturing per generation:

- `user_id`, `created_at`, `feature` (`studio_photo` / `metal_swap` / `model_shot` / `design` / `reel`)
- `source_image_hash` — so retries against the same source can be grouped
- `credit_grade`, `credits_consumed`
- `downloaded_at`, `shared_at`, `whatsapp_delivered_at` — nullable timestamps
- `regenerated_from_id` — nullable self-reference, set when a user regenerates from the same source within 10 minutes
- `model_used`, `latency_ms`, `provider_cost_usd`

Then build a single internal dashboard page, admin-only, showing:

1. **First-pass accept rate** — share of generations that were downloaded or shared with no regeneration from the same source within 10 minutes. Broken down by feature.
2. **Credits per usable output** — total credits consumed divided by accepted outputs. This is my true unit cost and my honest marketing claim.
3. **Free-to-paid conversion** — share of users who received free credits and later purchased.
4. **Repeat purchase rate** — share of first-time buyers who purchase again within 45 days. Show the cohort by signup week.
5. **Gross margin per feature** — revenue attributed minus `provider_cost_usd`.

Keep it one page. No charting library beyond what is already in the project. A table with numbers is fine.

**Acceptance criteria:**
- [ ] Every generation writes an event, including failures
- [ ] Dashboard is reachable only by my account and returns in under 3 seconds
- [ ] Repeat-purchase cohort table shows weeks since first purchase
- [ ] No user-facing performance regression on the generation path — logging is fire-and-forget

---

### P1-1 — Batch upload

**Problem:** one-at-a-time generation is what makes a high-SKU seller quit at piece four. This is the single biggest feature for the imitation and fashion jewellery segment.

**Scope:**

1. Upload up to **10 pieces** in one action — drag-drop or multi-select from phone gallery.
2. One shared settings panel applied to all: feature type, aspect ratio, background/scene preset, model preset.
3. Per-piece optional label (SKU or name), inline-editable in the queue.
4. Credit cost shown before submit — "10 pieces × 1 credit = 10 credits. You have 34." Block submit with a clear message if the balance is short, and link to the pack that covers the gap.
5. Process through the existing n8n orchestration, sequentially or with modest concurrency. Do not build a new job runner.
6. Live progress per piece: queued / generating / done / failed. Partial failure must not fail the batch.
7. **Failed pieces do not consume credits.** Refund the credit automatically on provider error and say so in the UI.
8. On completion, one WhatsApp delivery containing the whole set, and one library entry group.

**Acceptance criteria:**
- [ ] 10 pieces submit and complete without the user touching the page again
- [ ] A single provider failure leaves the other 9 unaffected and refunds 1 credit
- [ ] Closing the browser mid-batch does not lose results — they appear in the library
- [ ] Batch results are grouped in the library, not scattered as 10 loose entries

---

### P1-2 — Collection model consistency

**Problem:** a catalog where every product sits on a different face looks amateur. Same model across every SKU is what makes it look like a brand, and it is the hardest thing in this product for someone to reproduce by prompting a free tool.

**Scope:**

1. A **Collection** entity: name, plus a locked model profile.
2. Model profile is generated once — skin tone, age band, attire style, setting — then **the resulting model image is stored as a reference** and passed as an input image on every subsequent generation in that collection.

   Gemini does not expose a reliable seed for reproducible faces. The reference-image approach is the mechanism that actually works. Do not attempt seed-locking.
3. When starting a batch (P1-1), the user picks an existing collection or creates a new one. All pieces in the batch inherit the locked model.
4. Collections are visible in the library as a grouping and can feed the catalog builder directly.
5. If consistency drifts on a specific piece, allow a single per-piece regenerate that re-passes the reference at higher weight.

**Acceptance criteria:**
- [ ] Ten pieces generated in one collection show a visibly consistent model across all ten
- [ ] A new batch two weeks later in the same collection matches the original model
- [ ] Collection can be renamed and deleted without orphaning generated images

---

### P2-1 — Catalog PDF export

**Problem:** wholesalers forward PDF catalogs on WhatsApp. They do not forward links.

**Scope:**

1. Export any existing catalog to PDF: grid of product images with name, SKU, and price.
2. Cover page carrying the jeweller's own shop name, logo, and WhatsApp number — uploaded once in settings.
3. A4 portrait, 6 or 9 products per page, selectable.
4. File size under 5 MB so WhatsApp accepts it without compression damage. Compress images via Cloudinary transforms on the way in, not after generation.
5. Direct share to WhatsApp as a document, using the existing delivery integration.
6. Watermark the PDF if any included image was generated on free credits.

**Acceptance criteria:**
- [ ] A 30-product catalog exports in under 15 seconds and lands under 5 MB
- [ ] Prices render correctly, including any gold-rate-linked values if that data is available to Studio
- [ ] PDF opens correctly in WhatsApp on both Android and iOS

---

## 4. Build order and rough budget

I work 15–20 hours a week. IIFJAS is in August.

| Order | Item | Est. |
|---|---|---|
| 1 | P0-1 Pricing and packaging | 8–12 h |
| 2 | P0-2 Free credits and watermarking | 6–8 h |
| 3 | P0-3 WhatsApp capture and delivery | 10–14 h |
| 4 | P0-4 Analytics | 6–8 h |
| 5 | P1-1 Batch upload | 12–16 h |
| 6 | P1-2 Collection model consistency | 10–14 h |
| 7 | P2-1 Catalog PDF | 8–10 h |

Everything in P0 ships before the exhibition. P1 and P2 ship after, informed by what actually gets asked for at the stall.

---

## 5. Explicitly out of scope

Do not build any of these, however reasonable they seem while you are in the code:

- A mobile app
- Team or multi-user accounts
- API access for customers
- Any new AI feature or model
- Redesign of existing screens
- Email notifications of any kind
- Analytics beyond the six numbers in P0-4
- Image-to-CAD, virtual try-on, or anything from the Swarnix WhatsApp product

---

## 6. Definition of done

The build is done when, on production, a brand-new user can:

1. Sign in with Google, verify a WhatsApp number, and receive 10 watermarked-output credits
2. Upload 10 pieces in one batch, generate them against one consistent model, and receive the whole set on WhatsApp
3. Buy the ₹150 Trial pack, see exactly ₹150 at Razorpay, and have every earlier image become clean and downloadable
4. Build a catalog, export it as a PDF under 5 MB, and forward it on WhatsApp

— and I can open the analytics page and read my first-pass accept rate and my 45-day repeat purchase rate without doing any arithmetic myself.
