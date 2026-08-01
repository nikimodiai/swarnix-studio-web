// ── Frequently asked questions ──────────────────────────────────────
// Single source of truth for the in-app FAQ page. Grouped for scanning;
// answers reflect the real billing rules in credits.js / plans.js / reels.js —
// keep them in sync if those change.
//
// Every item carries an English (q/a) and Hindi (qHi/aHi) version so the FAQ
// page can offer a language toggle without a full i18n system — jewellers who
// are more comfortable reading Hindi shouldn't have to rely on English-only
// billing/refund rules.

export const FAQ_GROUPS = [
  {
    title: 'Credits & pricing',
    titleHi: 'क्रेडिट और कीमत',
    items: [
      {
        q: 'What is a credit?',
        qHi: 'क्रेडिट क्या है?',
        a: 'A credit is the unit you spend to generate media. One studio image (Studio Photo, Metal Swap, AI Model or Jewellery Design) costs 1 credit. Reels cost a few credits depending on length and quality.',
        aHi: 'क्रेडिट वह इकाई है जो आप कोई भी फोटो या वीडियो बनाने के लिए खर्च करते हैं। एक स्टूडियो इमेज (Studio Photo, Metal Swap, AI Model या Jewellery Design) के लिए 1 क्रेडिट लगता है। रील्स की कीमत उनकी लंबाई और क्वालिटी के हिसाब से कुछ क्रेडिट होती है।',
      },
      {
        q: 'How many credits does a reel use?',
        qHi: 'एक रील में कितने क्रेडिट लगते हैं?',
        a: 'It depends on length, resolution and mode — the exact cost is always shown before you submit. As a guide, an 8-second Classic reel costs about 3 credits at SD (480p), 6 credits at HD (720p) and 13 credits at Full HD (1080p). Storyboard reels add 1 credit per scene, because each scene is given its own freshly generated opening shot — so the same 8-second reel costs about 5, 8 or 15 credits.',
        aHi: 'यह रील की लंबाई, रेजोल्यूशन और मोड पर निर्भर करता है — सबमिट करने से पहले हमेशा सही कीमत दिखाई जाती है। अंदाज़े के लिए, 8-सेकंड की Classic रील की कीमत SD (480p) में लगभग 3 क्रेडिट, HD (720p) में 6 क्रेडिट और Full HD (1080p) में 13 क्रेडिट होती है। Storyboard रील में हर सीन के लिए 1 अतिरिक्त क्रेडिट लगता है, क्योंकि हर सीन की अपनी नई शुरुआती फोटो बनाई जाती है — इसलिए वही 8-सेकंड की रील लगभग 5, 8 या 15 क्रेडिट में बनती है।',
      },
      {
        q: 'What do my 10 free sign-up credits get me?',
        qHi: 'साइन-अप पर मिलने वाले 10 मुफ़्त क्रेडिट से क्या मिलता है?',
        a: 'Enough to try the suite properly: 10 studio images, or a couple of 8-second SD reels. They are yours the moment you sign in with Google — no card, no approval. Images made with free credits carry a small "Swarnix Studio" watermark in the corner; buy any credit pack and every image you have already made unlocks clean, including the free ones.',
        aHi: 'यह पूरे सूट को अच्छी तरह आज़माने के लिए काफ़ी है: 10 स्टूडियो इमेज, या दो 8-सेकंड की SD रील्स। Google से साइन इन करते ही ये आपके खाते में आ जाते हैं — न कोई कार्ड, न कोई अप्रूवल चाहिए। मुफ़्त क्रेडिट से बनी इमेज पर कोने में एक छोटा "Swarnix Studio" वॉटरमार्क रहता है; कोई भी क्रेडिट पैक खरीदते ही अब तक बनाई गई सभी इमेज, मुफ़्त वाली सहित, बिना वॉटरमार्क के अनलॉक हो जाती हैं।',
      },
      {
        q: 'Do credits expire?',
        qHi: 'क्या क्रेडिट की कोई एक्सपायरी होती है?',
        a: 'No. Credits never expire, and one balance works across every Studio Suite feature.',
        aHi: 'नहीं। क्रेडिट कभी एक्सपायर नहीं होते, और एक ही बैलेंस पूरे Studio Suite के सभी फीचर्स में काम करता है।',
      },
      {
        q: 'How do I buy more credits?',
        qHi: 'मैं और क्रेडिट कैसे खरीद सकता हूं?',
        a: 'Credit packs are coming soon. Until then you can earn free credits through Refer & Earn — invite a fellow jeweller and you both receive 10 credits.',
        aHi: 'क्रेडिट पैक जल्द आ रहे हैं। तब तक आप Refer & Earn के ज़रिए मुफ़्त क्रेडिट कमा सकते हैं — किसी साथी जौहरी को आमंत्रित करें और आप दोनों को 10-10 क्रेडिट मिलेंगे।',
      },
    ],
  },
  {
    title: 'Failures & refunds',
    titleHi: 'फेलियर और रिफंड',
    items: [
      {
        q: 'What happens if an image generation fails?',
        qHi: 'अगर इमेज जनरेशन फेल हो जाए तो क्या होता है?',
        a: 'You are only charged when an image is successfully generated. If a generation fails, no credit is deducted.',
        aHi: 'आपसे तभी चार्ज लिया जाता है जब इमेज सफलतापूर्वक बन जाए। अगर जनरेशन फेल होता है, तो कोई क्रेडिट नहीं कटता।',
      },
      {
        q: 'What happens if a reel fails to render?',
        qHi: 'अगर रील रेंडर होने में फेल हो जाए तो क्या होता है?',
        a: 'You never pay for a failed reel. Storyboard reels are charged only once the reel finishes successfully — nothing is deducted while it renders, so a failed reel is simply never billed. Classic reels set their credits aside when you submit, and if the render fails those credits are automatically returned to your balance.',
        aHi: 'फेल हुई रील के लिए आपसे कभी पैसे नहीं लिए जाते। Storyboard रील का चार्ज तभी लगता है जब रील सफलतापूर्वक पूरी बन जाए — रेंडर होते समय कुछ भी नहीं कटता, इसलिए फेल हुई रील का बिल कभी नहीं बनता। Classic रील में सबमिट करते ही क्रेडिट अलग रख दिए जाते हैं, और अगर रेंडर फेल हो जाए तो वे क्रेडिट अपने आप आपके बैलेंस में वापस आ जाते हैं।',
      },
      {
        q: 'The result is not what I expected — do I get a refund?',
        qHi: 'रिज़ल्ट मेरी उम्मीद जैसा नहीं है — क्या मुझे रिफंड मिलेगा?',
        a: 'Credits are consumed on every successful generation, as each run carries a real compute cost regardless of the outcome. Small adjustments to your photo (sharper focus, better lighting, a plain background) or a more specific description often improve the result significantly. If the output appears genuinely broken rather than simply not matching your preferred style, please contact support and we will make it right.',
        aHi: 'हर सफल जनरेशन पर क्रेडिट खर्च होता है, क्योंकि नतीजा जो भी हो, उसे बनाने में असल कंप्यूटिंग लागत लगती है। अपनी फोटो में छोटे सुधार (शार्प फोकस, बेहतर रोशनी, सादा बैकग्राउंड) या ज़्यादा स्पष्ट डिस्क्रिप्शन देने से अक्सर नतीजा काफ़ी बेहतर हो जाता है। अगर आउटपुट सच में खराब लगे — सिर्फ़ आपकी पसंद से अलग नहीं, बल्कि वाकई गड़बड़ — तो कृपया सपोर्ट से संपर्क करें, हम उसे ठीक करेंगे।',
      },
    ],
  },
  {
    title: 'Features',
    titleHi: 'फीचर्स',
    items: [
      {
        q: 'What can the six Studio tools do?',
        qHi: 'ये छह Studio टूल्स क्या-क्या कर सकते हैं?',
        a: 'Studio Photo turns a counter photo into a studio-lit shot; Metal Swap recolours a piece into yellow, white or rose gold; AI Model places your jewellery on a photorealistic model; Jewellery Design renders a new piece from a description or reference; Generate Reels makes a short video with motion and music; and Library keeps everything you’ve generated in one private place.',
        aHi: 'Studio Photo किसी काउंटर फोटो को स्टूडियो-लाइटेड शॉट में बदल देता है; Metal Swap किसी पीस को येलो, व्हाइट या रोज़ गोल्ड में दिखा देता है; AI Model आपकी ज्वेलरी को एक असली जैसे मॉडल पर पहनाकर दिखाता है; Jewellery Design किसी डिस्क्रिप्शन या रेफरेंस से नया डिज़ाइन बना देता है; Generate Reels मोशन और म्यूज़िक के साथ एक छोटी वीडियो बनाता है; और Library में आपकी बनाई हर चीज़ एक ही जगह, निजी तौर पर सुरक्षित रहती है।',
      },
      {
        q: 'Which tools are completely free?',
        qHi: 'कौन से टूल्स पूरी तरह मुफ़्त हैं?',
        a: 'Daily Gold Rate posters, Festival Posters, the WhatsApp Catalog maker and Store Branding use no credits at all — they are free marketing tools included with your account.',
        aHi: 'Daily Gold Rate पोस्टर, Festival Posters, WhatsApp Catalog बनाने वाला टूल और Store Branding — इनमें कोई क्रेडिट नहीं लगता। ये आपके खाते के साथ मुफ़्त मार्केटिंग टूल की तरह शामिल हैं।',
      },
      {
        q: 'What photos work best?',
        qHi: 'सबसे अच्छा नतीजा किन फोटो से मिलता है?',
        a: 'A sharp, well-lit photo of a single piece works best — even a phone photo on the counter. Avoid heavy blur, glare and busy backgrounds. Higher-quality input gives noticeably better output.',
        aHi: 'एक साफ़, अच्छी रोशनी वाली, अकेले पीस की फोटो सबसे अच्छा नतीजा देती है — चाहे वह काउंटर पर ली गई फोन की फोटो ही क्यों न हो। ज़्यादा धुंधली फोटो, चमक (glare) और भरी-भरी बैकग्राउंड से बचें। जितनी अच्छी फोटो डालेंगे, नतीजा उतना ही बेहतर मिलेगा।',
      },
      {
        q: 'Who owns the generated images and reels?',
        qHi: 'बनाई गई इमेज और रील्स का मालिकाना हक किसका है?',
        a: 'You do. Use them freely on Instagram, WhatsApp, your website and print. Just make sure the photos you upload are your own or ones you have rights to use.',
        aHi: 'आपका। इन्हें आप बेझिझक Instagram, WhatsApp, अपनी वेबसाइट और प्रिंट में इस्तेमाल कर सकते हैं। बस ध्यान रखें कि आप जो फोटो अपलोड कर रहे हैं वह आपकी अपनी हो या जिसे इस्तेमाल करने का आपके पास अधिकार हो।',
      },
      {
        q: 'Are my photos and designs private?',
        qHi: 'क्या मेरी फोटो और डिज़ाइन प्राइवेट रहते हैं?',
        a: 'Yes. Your uploads and generated media are stored against your account only — other jewellers can never see your pieces, your designs or your Library.',
        aHi: 'हां। आपकी अपलोड की गई और बनाई गई सभी फोटो/वीडियो सिर्फ़ आपके खाते के साथ सुरक्षित रहती हैं — कोई और जौहरी कभी भी आपके पीस, डिज़ाइन या Library नहीं देख सकता।',
      },
    ],
  },
  {
    title: 'Refer & Earn',
    titleHi: 'रेफ़र करें और कमाएं',
    items: [
      {
        q: 'How does Refer & Earn work?',
        qHi: 'Refer & Earn कैसे काम करता है?',
        a: 'Share your personal referral link from the Refer & Earn page. When a jeweller signs up through it and makes their first purchase, you both receive 10 free credits automatically.',
        aHi: 'Refer & Earn पेज से अपना निजी रेफरल लिंक शेयर करें। जब कोई जौहरी उस लिंक से साइन अप करके अपनी पहली खरीदारी करता है, तो आप दोनों को अपने आप 10-10 मुफ़्त क्रेडिट मिल जाते हैं।',
      },
      {
        q: 'How many jewellers can I refer?',
        qHi: 'मैं कितने जौहरियों को रेफ़र कर सकता हूं?',
        a: 'Up to 10 successful referrals, earning you up to 100 free credits in total.',
        aHi: 'अधिकतम 10 सफल रेफरल तक, जिससे आप कुल 100 मुफ़्त क्रेडिट तक कमा सकते हैं।',
      },
    ],
  },
];
