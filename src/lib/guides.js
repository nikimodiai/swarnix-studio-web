// ── Per-feature "How to use this" guides ─────────────────────────────
// Bilingual (English + Hindi) step-by-step instructions shown from the Guide
// button in each feature's header. Keyed by the same id GuideButton is given
// at each call site — see components/GuideButton.jsx.

export const GUIDES = {
  studio_photo: {
    title: 'Studio Photo — Guide',
    titleHi: 'Studio Photo — गाइड',
    steps: [
      'Upload a photo of your jewellery, or take one with your camera — even a counter photo works.',
      'Pick a studio background style, or choose "Custom…" and describe your own in words.',
      'Tap Generate. Your studio-lit photo is ready in under a minute.',
      'Download it, or find it later in your Library.',
    ],
    stepsHi: [
      'अपनी ज्वेलरी की फोटो अपलोड करें, या कैमरे से फोटो लें — काउंटर पर ली गई फोटो भी चलेगी।',
      'कोई स्टूडियो बैकग्राउंड स्टाइल चुनें, या "Custom…" चुनकर अपने शब्दों में बैकग्राउंड बताएं।',
      'Generate दबाएं। एक मिनट से कम समय में आपकी स्टूडियो-लाइटेड फोटो तैयार हो जाएगी।',
      'इसे डाउनलोड करें, या बाद में अपनी Library में देखें।',
    ],
  },
  metal_swap: {
    title: 'Metal Swap — Guide',
    titleHi: 'Metal Swap — गाइड',
    steps: [
      'Upload a photo of your jewellery, or take one with your camera.',
      'Pick the target metal — yellow, white or rose gold, silver, antique gold — or choose "Custom…" to describe your own finish.',
      'Optionally pick a background too, or keep the original background as-is.',
      'Tap Generate to see the same piece in the new metal.',
    ],
    stepsHi: [
      'अपनी ज्वेलरी की फोटो अपलोड करें, या कैमरे से फोटो लें।',
      'जो मेटल चाहिए वह चुनें — येलो, व्हाइट या रोज़ गोल्ड, सिल्वर, एंटीक गोल्ड — या "Custom…" चुनकर अपनी पसंद की फिनिश बताएं।',
      'चाहें तो बैकग्राउंड भी चुन सकते हैं, या पुराना बैकग्राउंड वैसे ही रख सकते हैं।',
      'नए मेटल में वही पीस देखने के लिए Generate दबाएं।',
    ],
  },
  ai_model: {
    title: 'AI Model — Guide',
    titleHi: 'AI Model — गाइड',
    steps: [
      'Upload a clear photo of one jewellery piece.',
      'Pick an occasion (bridal, festive, party, daily wear, office) — it auto-fills matching outfit and background, which you can still change.',
      'Fine-tune model, skin tone, framing, pose, attire, background, aspect ratio and lighting — every field is a simple dropdown.',
      'Use "Custom note" at the bottom to add anything the dropdowns do not cover, in your own words.',
      'Tap Generate. Your jewellery appears on a photorealistic model, ready to post.',
    ],
    stepsHi: [
      'अपनी किसी एक ज्वेलरी पीस की साफ़ फोटो अपलोड करें।',
      'कोई मौका चुनें (ब्राइडल, फेस्टिव, पार्टी, डेली वियर, ऑफिस) — इससे मैचिंग आउटफिट और बैकग्राउंड अपने आप भर जाते हैं, जिन्हें आप बाद में बदल भी सकते हैं।',
      'मॉडल, स्किन टोन, फ्रेमिंग, पोज़, आउटफिट, बैकग्राउंड, आस्पेक्ट रेशियो और लाइटिंग को अपनी पसंद के हिसाब से सेट करें — हर फील्ड एक आसान ड्रॉपडाउन है।',
      'नीचे "Custom note" में वह सब लिखें जो ड्रॉपडाउन में नहीं मिला, अपने शब्दों में।',
      'Generate दबाएं। आपकी ज्वेलरी एक असली जैसे मॉडल पर तैयार मिलेगी, पोस्ट करने के लिए एकदम तैयार।',
    ],
  },
  jewellery_design: {
    title: 'Jewellery Design — Guide',
    titleHi: 'Jewellery Design — गाइड',
    steps: [
      'Choose "From scratch" to design from a description, or "From reference" to reinterpret an uploaded photo.',
      'Fill in the piece type, metal, purity, finish, stones and motifs step by step.',
      'If a motif isn’t listed, pick "Custom" and describe it in words.',
      'Use "Anything else?" at the end to add any instruction the form does not cover.',
      'Tap Generate to get a photorealistic render of your design.',
    ],
    stepsHi: [
      '"From scratch" चुनें अगर सिर्फ़ डिस्क्रिप्शन से डिज़ाइन बनवाना है, या "From reference" चुनें किसी अपलोड की गई फोटो को नए रूप में बनवाने के लिए।',
      'पीस टाइप, मेटल, प्योरिटी, फिनिश, स्टोन और मोटिफ़ को चरण दर चरण भरें।',
      'अगर कोई मोटिफ़ लिस्ट में नहीं है, तो "Custom" चुनकर उसे अपने शब्दों में बताएं।',
      'आख़िर में "Anything else?" में वह कुछ भी लिखें जो फॉर्म में शामिल नहीं है।',
      'अपने डिज़ाइन की असली जैसी फोटो पाने के लिए Generate दबाएं।',
    ],
  },
  reels: {
    title: 'Generate Reels — Guide',
    titleHi: 'Generate Reels — गाइड',
    steps: [
      'Add one photo for a Storyboard reel (AI writes a multi-scene script for you), or up to 6 photos for a Classic reel.',
      'Pick the format (Story/Post/Landscape), length and quality.',
      'Choose a background from the dropdown, or pick "Custom…" and describe your own.',
      'Optionally add music, on-screen text and anything else in the prompt box.',
      'Tap Generate — your reel usually finishes rendering in 1–4 minutes.',
    ],
    stepsHi: [
      'Storyboard रील के लिए एक फोटो जोड़ें (AI आपके लिए कई सीन की स्क्रिप्ट खुद लिख देगा), या Classic रील के लिए 6 फोटो तक जोड़ें।',
      'फॉर्मेट (Story/Post/Landscape), लंबाई और क्वालिटी चुनें।',
      'ड्रॉपडाउन से बैकग्राउंड चुनें, या "Custom…" चुनकर अपनी पसंद का बैकग्राउंड बताएं।',
      'चाहें तो म्यूज़िक, स्क्रीन पर टेक्स्ट और प्रॉम्प्ट बॉक्स में कुछ और भी जोड़ सकते हैं।',
      'Generate दबाएं — रील आमतौर पर 1–4 मिनट में तैयार हो जाती है।',
    ],
  },
  library: {
    title: 'Library — Guide',
    titleHi: 'Library — गाइड',
    steps: [
      'Every photo and reel you have generated across all Studio Suite features appears here automatically.',
      'Tap any item to view it full-size, download it, or share it directly.',
      'Free-credit images carry a small watermark — buy any credit pack and every image you have already made, including old ones, unlocks clean.',
      'Use the filter to jump straight to a specific feature’s results.',
    ],
    stepsHi: [
      'आपने Studio Suite के जिस भी फीचर से जो भी फोटो या रील बनाई है, वह यहां अपने आप दिख जाती है।',
      'किसी भी आइटम पर टैप करके उसे बड़े साइज़ में देखें, डाउनलोड करें, या सीधे शेयर करें।',
      'मुफ़्त क्रेडिट से बनी फोटो पर एक छोटा वॉटरमार्क रहता है — कोई भी क्रेडिट पैक खरीदते ही अब तक बनी सभी फोटो, पुरानी सहित, बिना वॉटरमार्क के अनलॉक हो जाती हैं।',
      'किसी खास फीचर के नतीजों पर सीधे जाने के लिए फ़िल्टर का इस्तेमाल करें।',
    ],
  },
  batch: {
    title: 'Batch Studio — Guide',
    titleHi: 'Batch Studio — गाइड',
    steps: [
      'Choose what to do with every piece — Studio Photo, Metal Swap, or AI Model.',
      'Pick the shared settings (background/scene, target metal, or category) once — they apply to all pieces in this batch.',
      'Add up to 10 photos. Each generates using the same settings, one credit per piece.',
      'For AI Model, optionally start or pick a Collection to keep the same model’s face consistent across every piece.',
      'Tap Start — pieces process one by one and finished ones appear as a photo grid right here.',
    ],
    stepsHi: [
      'तय करें कि हर पीस के साथ क्या करना है — Studio Photo, Metal Swap, या AI Model।',
      'एक बार शेयर की गई सेटिंग्स चुनें (बैकग्राउंड/सीन, टारगेट मेटल, या कैटेगरी) — यह इस पूरे बैच के सभी पीस पर लागू होगी।',
      '10 फोटो तक जोड़ें। हर एक उसी सेटिंग से बनेगी, हर पीस पर एक क्रेडिट लगेगा।',
      'AI Model के लिए, चाहें तो एक Collection शुरू करें या चुनें ताकि सभी पीस में मॉडल का चेहरा एक जैसा रहे।',
      'Start दबाएं — हर पीस बारी-बारी बनती है और तैयार पीस यहीं फोटो ग्रिड में दिखने लगते हैं।',
    ],
  },
};
