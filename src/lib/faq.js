// ── Frequently asked questions ──────────────────────────────────────
// Single source of truth for the in-app FAQ page. Grouped for scanning;
// answers reflect the real billing rules in credits.js / plans.js / reels.js —
// keep them in sync if those change.

export const FAQ_GROUPS = [
  {
    title: 'Credits & pricing',
    items: [
      {
        q: 'What is a credit?',
        a: 'A credit is the unit you spend to generate media. One studio image (Studio Photo, Metal Swap, AI Model or Jewellery Design) costs 1 credit. Reels cost a few credits depending on length and quality.',
      },
      {
        q: 'How many credits does a reel use?',
        a: 'It depends on length and resolution — the exact cost is shown before you submit. As a guide, an 8-second reel costs about 3 credits at SD (480p), 6 credits at HD (720p) and 13 credits at Full HD (1080p).',
      },
      {
        q: 'What do my 3 free sign-up credits get me?',
        a: 'Enough to try the suite properly: 3 studio images, or one 8-second SD reel. They are yours the moment you sign in with Google — no card, no approval.',
      },
      {
        q: 'Do credits expire?',
        a: 'No. Credits never expire, and one balance works across every Studio Suite feature.',
      },
      {
        q: 'How do I buy more credits?',
        a: 'Credit packs are coming soon. Until then you can earn free credits through Refer & Earn — invite a fellow jeweller and you both receive 10 credits.',
      },
    ],
  },
  {
    title: 'Failures & refunds',
    items: [
      {
        q: 'What happens if an image generation fails?',
        a: 'You are only charged when an image is successfully generated. If a generation fails, no credit is deducted.',
      },
      {
        q: 'What happens if a reel fails to render?',
        a: 'Reels reserve their credits when you submit (they render in the background). If the render fails, the reserved credits are automatically refunded to your balance — you never pay for a failed reel.',
      },
      {
        q: 'The result is not what I expected — do I get a refund?',
        a: 'Credits are consumed for every successful generation, even if you don’t love the result — each run costs us real AI compute. Small changes to your photo (sharper, well-lit, plain background) or your description usually improve results a lot. If something looks broken rather than just off-style, contact support and we’ll make it right.',
      },
    ],
  },
  {
    title: 'Features',
    items: [
      {
        q: 'What can the six Studio tools do?',
        a: 'Studio Photo turns a counter photo into a studio-lit shot; Metal Swap recolours a piece into yellow, white or rose gold; AI Model places your jewellery on a photorealistic model; Jewellery Design renders a new piece from a description or reference; Generate Reels makes a short video with motion and music; and Library keeps everything you’ve generated in one private place.',
      },
      {
        q: 'Which tools are completely free?',
        a: 'Daily Gold Rate posters, Festival Posters, the WhatsApp Catalog maker and Store Branding use no credits at all — they are free marketing tools included with your account.',
      },
      {
        q: 'What photos work best?',
        a: 'A sharp, well-lit photo of a single piece works best — even a phone photo on the counter. Avoid heavy blur, glare and busy backgrounds. Higher-quality input gives noticeably better output.',
      },
      {
        q: 'Who owns the generated images and reels?',
        a: 'You do. Use them freely on Instagram, WhatsApp, your website and print. Just make sure the photos you upload are your own or ones you have rights to use.',
      },
      {
        q: 'Are my photos and designs private?',
        a: 'Yes. Your uploads and generated media are stored against your account only — other jewellers can never see your pieces, your designs or your Library.',
      },
    ],
  },
  {
    title: 'Refer & Earn',
    items: [
      {
        q: 'How does Refer & Earn work?',
        a: 'Share your personal referral link from the Refer & Earn page. When a jeweller signs up through it and makes their first purchase, you both receive 10 free credits automatically.',
      },
      {
        q: 'How many jewellers can I refer?',
        a: 'There is no limit — every successful referral earns you another 10 credits.',
      },
    ],
  },
];
