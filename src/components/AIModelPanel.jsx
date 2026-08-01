import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Sparkles, RefreshCw, PlusCircle, X, AlertCircle, Camera, Maximize2, Share2, Copy, Check } from 'lucide-react';
import { MAX_IMAGE_BYTES } from '../lib/config';
import { runAiModel } from '../lib/aiModel';
import { useAuth } from '../hooks/useAuth';
import { hasFeature } from '../lib/plans';
import { canUseSuite, suiteUnitsLeft, chargeSuiteGraded } from '../lib/studioSuite';
import { saveGenerations } from '../lib/watermark';
import { logGeneration } from '../lib/analytics';
import { shareImageFile } from '../lib/imageUtils';
import StudioLibraryPicker from './StudioLibraryPicker';
import InfoDot from './InfoDot';
import styles from './AIModelPanel.module.css';

// ── Owner tuning options (chips) ────────────────────────────────────
const OCCASIONS = [
  { v: 'bridal',  label: '💍 Bridal',     tip: 'Heavy traditional bridal styling — rich outfit, ornate backdrop, full glam. Best for wedding-season pieces.' },
  { v: 'festive', label: '🪔 Festive',    tip: 'Festival look — vibrant ethnic wear and a warm festive backdrop. Great for Diwali / Navratri collections.' },
  { v: 'party',   label: '🎉 Party',      tip: 'Party / cocktail styling — modern outfit, glam lighting. Good for contemporary & diamond pieces.' },
  { v: 'daily',   label: '☀️ Daily wear', tip: 'Everyday casual look — light outfit, simple background. Best for lightweight daily-wear jewellery.' },
  { v: 'office',  label: '💼 Office',      tip: 'Clean minimal look — neutral outfit, plain studio background. Best for subtle office-wear jewellery.' },
];
const MODELS = [
  { v: 'female', label: 'Female', tip: 'A female model wears the jewellery. Best for earrings, necklaces, bangles, mangalsutra.' },
  { v: 'male',   label: 'Male',   tip: "A male model wears the jewellery. Best for men's rings, chains, bracelets, kada." },
];
const SKIN = [
  { v: 'auto',     label: 'Auto',                    tip: 'Let AI pick a natural skin tone.' },
  { v: 'fair',     label: 'Fair',     dot: '#f3d6bd', tip: 'Light / fair complexion.' },
  { v: 'wheatish', label: 'Wheatish', dot: '#d9ab84', tip: 'Wheatish / medium complexion — the most common Indian skin tone.' },
  { v: 'dusky',    label: 'Dusky',    dot: '#a9743f', tip: 'Dusky / tan complexion.' },
  { v: 'deep',     label: 'Deep',     dot: '#6b4424', tip: 'Deep / dark complexion.' },
];
const FRAMING = [
  { v: 'full_portrait', label: 'Full portrait',   tip: 'Full face and shoulders visible — a classic model portrait.' },
  { v: 'half_face',     label: 'Half-face',        tip: 'Only the lower half of the face shows (lips, neck, jewellery). Keeps focus on the piece and avoids a recognisable face.' },
  { v: 'close_up',      label: 'Close-up region',  tip: 'Tight close-up on just the area that matters — ears for earrings, neckline for necklaces, hand for rings.' },
  { v: 'neck_only',     label: 'Neck only',        tip: 'Only the neck and collarbone are shown — no full face. Clean look for necklaces & pendants.' },
  { v: 'hands_only',    label: 'Hands only',       tip: 'Only the hands are shown — no face. Best for rings and bracelets.' },
  { v: 'macro',         label: 'Macro on skin',    tip: 'Extreme macro of the jewellery resting on skin — almost product-like, with a human touch.' },
];
const POSE = [
  { v: 'auto',           label: 'Auto',           tip: 'Let AI pick the most flattering angle for this jewellery.' },
  { v: 'front',          label: 'Front',          tip: 'Model looks straight at the camera. Best for necklaces & mangalsutra.' },
  { v: 'three_quarter',  label: '3/4 turn',       tip: 'Model turned slightly — shows both the face and the side. A natural, editorial look.' },
  { v: 'side_profile',   label: 'Side profile',   tip: 'Full side view. Best for earrings, nose pins and maang tikka.' },
  { v: 'hand_near_face', label: 'Hand near face', tip: 'Hand raised near the face — shows rings, bangles and earrings together in one shot.' },
];
const ATTIRE = [
  { v: 'auto',        label: 'Auto',         tip: 'Let AI pick an outfit that suits the jewellery.' },
  { v: 'saree',       label: 'Saree',        tip: 'Traditional saree — elegant draping, great for necklaces & mangalsutra.' },
  { v: 'lehenga',     label: 'Lehenga',      tip: 'Festive lehenga — full ethnic look for bridal and festive jewellery.' },
  { v: 'bridal',      label: 'Bridal',       tip: 'Full bridal outfit with heavy detailing — for premium wedding sets.' },
  { v: 'indo_western',label: 'Indo-western', tip: 'Indo-western fusion — modern yet ethnic. Good for contemporary pieces.' },
  { v: 'gown',        label: 'Gown',         tip: 'Western evening gown — for diamond and contemporary jewellery.' },
  { v: 'plain',       label: 'Plain neutral',tip: 'A plain, neutral top so nothing competes with the jewellery.' },
];
const ATTIRE_COLOR = [
  { v: 'neutral', label: 'Neutral',    dot: '#cfcfcf', tip: 'Neutral / muted outfit colour — lets the jewellery stand out.' },
  { v: 'red',     label: 'Red',        dot: '#b4232a', tip: 'Red outfit — classic festive & bridal contrast for gold.' },
  { v: 'pastel',  label: 'Pastel',     dot: '#f2c9d4', tip: 'Soft pastel outfit — gentle, modern look.' },
  { v: 'jewel',   label: 'Jewel-tone', dot: '#1f5c4d', tip: 'Rich jewel-tone outfit (emerald, royal blue, maroon).' },
  { v: 'black',   label: 'Black',      dot: '#111111', tip: 'Black outfit — high contrast, makes diamonds & polki shine.' },
];
const BACKGROUND = [
  { v: 'studio_white', label: 'Studio white',   tip: 'Clean white studio — the standard e-commerce / catalogue look.' },
  { v: 'studio_grey',  label: 'Studio grey',    tip: 'Neutral grey studio — soft and premium.' },
  { v: 'beige',        label: 'Beige',          tip: 'Warm beige backdrop — flatters gold jewellery.' },
  { v: 'gradient',     label: 'Soft gradient',  tip: 'Soft colour gradient behind the model — modern and vibrant.' },
  { v: 'mandap',       label: 'Wedding mandap', tip: 'Decorated wedding stage / mandap — for bridal sets.' },
  { v: 'palace',       label: 'Palace',         tip: 'Royal palace interior — luxurious, regal feel.' },
  { v: 'outdoor',      label: 'Outdoor bokeh',  tip: 'Blurred outdoor background (bokeh) — natural lifestyle look.' },
  { v: 'brand',        label: 'Brand colour',   tip: 'Use your own brand colour as the background. Pick the swatch.' },
];
const ASPECT = [
  { v: '1:1',  label: 'Square 1:1',    tip: 'Square — best for Instagram & catalogue grids.' },
  { v: '4:5',  label: 'Portrait 4:5',  tip: 'Tall portrait — fills more of the phone screen.' },
  { v: '9:16', label: 'Story 9:16',    tip: 'Full-screen vertical — for WhatsApp / Instagram Stories & Reels.' },
  { v: '16:9', label: 'Landscape 16:9',tip: 'Wide — for website banners.' },
];
const LIGHTING = [
  { v: 'clean',     label: 'Clean e-commerce', tip: 'Bright, even lighting — clean catalogue style.' },
  { v: 'soft',      label: 'Soft studio',      tip: 'Gentle, flattering studio light.' },
  { v: 'editorial', label: 'Editorial',        tip: 'High-fashion magazine look with dramatic shadows.' },
  { v: 'golden',    label: 'Golden hour',      tip: 'Warm sunset glow — flatters gold jewellery.' },
  { v: 'moody',     label: 'Moody dark',       tip: 'Dark, moody background — makes diamonds & polki sparkle.' },
];
const PHOTOS = [1, 2, 4];

const DEFAULT_SEL = {
  occasion: 'festive',
  model_gender: 'female',
  skin_tone: 'auto',
  framing: 'full_portrait',
  pose: 'auto',
  attire: 'auto',
  attire_color: 'neutral',
  background: 'studio_white',
  brand_color: '#0B1829',
  aspect: '9:16',
  lighting: 'clean',
  custom_note: '',
  photos: 1,
};

export default function AIModelPanel({ category, onAddImage, addLabel = 'Add to Images' }) {
  const { store, refreshStore } = useAuth();
  const fileRef = useRef(null);
  const camRef  = useRef(null);

  const [srcFile, setSrcFile]       = useState(null);
  const [srcPreview, setSrcPrev]    = useState(null);
  const [generating, setGenerating] = useState(false);
  const [results, setResults]       = useState([]);     // [{ url, added }]
  // Grade of the credit that paid for the current results — 'free' means these
  // are watermarked until the user buys a pack.
  const [resultGrade, setResultGrade] = useState(null);
  const [error, setError]           = useState(null);
  const [lightboxUrl, setLightbox]  = useState(null);
  const [copied, setCopied]         = useState(false);
  const [shareOpen, setShareOpen]   = useState(false);
  const [sel, setSel]               = useState(DEFAULT_SEL);
  const [libOpen, setLibOpen]       = useState(false);


  // Credit balance (shared across every Studio Suite feature). `remaining` drives
  // the badge, the per-photo pre-check, and the out-of-credits note.
  const remaining = suiteUnitsLeft(store);
  const canUse  = canUseSuite(store, 1);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setError(null);
    setResults([]);
    setSrcFile(file);
    setSrcPrev(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  // Pick a previously generated image from the Studio Library. The AI-model
  // webhook takes a file part, so fetch the hosted URL into a File first.
  const pickFromLibrary = async (url) => {
    setLibOpen(false);
    setError(null);
    setResults([]);
    try {
      const resp = await fetch(url, { mode: 'cors' });
      const blob = await resp.blob();
      const file = new File([blob], `library_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
      setSrcFile(file);
      setSrcPrev(url);
    } catch {
      setError('Could not load that image from your library. Try another or upload a file.');
    }
  };

  // One webhook call → returns a result URL (throws on failure)
  const generateOne = () => runAiModel({ ownerId: store.owner_id, source: srcFile, category, sel });

  const generate = async () => {
    if (!srcFile || !canUse) return;
    const n = sel.photos;
    if (remaining !== Infinity && n > remaining) {
      setError(`Generating ${n} photos would exceed your monthly limit (${remaining} left). Pick fewer photos.`);
      return;
    }

    setGenerating(true);
    setError(null);
    setResults([]);
    setShareOpen(false);
    const startedAt = Date.now();

    try {
      const settled = await Promise.allSettled(Array.from({ length: n }, () => generateOne()));
      const urls = settled.filter(s => s.status === 'fulfilled' && s.value).map(s => s.value);

      if (urls.length === 0) {
        const firstErr = settled.find(s => s.status === 'rejected');
        throw new Error(firstErr?.reason?.message || 'Generation failed. Please try again.');
      }

      setResults(urls.map(url => ({ url, added: false })));

      // Charge the shared Studio Suite meter by the number of photos produced,
      // noting which grade of credit paid for them.
      const { grade } = await chargeSuiteGraded(store.owner_id, urls.length);
      // Persist each generated image to the shared Studio Suite library
      // (app_gallery, kind='ai_model') so it shows up in Library across the
      // web app and the mobile studio. owner_id === user.id, so user_id maps
      // to the store owner and RLS (auth.uid() = user_id) is satisfied.
      // Free-grade output is archived clean and shown watermarked.
      try {
        const shown = await saveGenerations(urls, grade, {
          user_id: store.owner_id,
          title: 'AI model',
          kind: 'ai_model',
        });
        setResults(shown.map(url => ({ url, added: false })));
      } catch { /* non-fatal: the image is still shown and addable */ }
      setResultGrade(grade);
      logGeneration({
        feature: 'ai_model',
        creditGrade: grade,
        creditsConsumed: urls.length,
        latencyMs: Date.now() - startedAt,
      });
      await refreshStore();

      if (urls.length < n) {
        setError(`${urls.length} of ${n} photos generated — the rest failed. You were only charged for ${urls.length}.`);
      }
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
      logGeneration({ feature: 'ai_model', status: 'failed', latencyMs: Date.now() - startedAt });
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToProduct = (url) => {
    onAddImage(url);
    setResults(rs => rs.map(r => (r.url === url ? { ...r, added: true } : r)));
  };

  const reset = () => {
    setSrcFile(null);
    setSrcPrev(null);
    setResults([]);
    setError(null);
    setLightbox(null);
    setShareOpen(false);
    setCopied(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCopyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleShare = (platform, url) => {
    const text = encodeURIComponent('Check out this jewellery look! 💎');
    const u    = encodeURIComponent(url);
    const shareUrls = {
      whatsapp:  `https://wa.me/?text=${text}%20${u}`,
      instagram: `https://www.instagram.com/`,
      gmail:     `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent('Jewellery Look')}&body=${text}%20${u}`,
      twitter:   `https://twitter.com/intent/tweet?text=${text}&url=${u}`,
    };
    if (platform === 'instagram' && navigator.share) {
      navigator.share({ title: 'Jewellery Look', text: 'Check out this jewellery look! 💎', url }).catch(() => {});
      return;
    }
    if (shareUrls[platform]) window.open(shareUrls[platform], '_blank');
    setShareOpen(false);
  };

  const handleNativeShare = async (url) => {
    const shared = await shareImageFile(url, { title: 'AI Jewellery Model', text: 'Check out this jewellery look! 💎' });
    if (!shared) setShareOpen(v => !v);
  };

// Render a single-select dropdown for one tuning field. Chip buttons looked
  // fine on a laptop but turned into an unreadable wall on a phone — a native
  // <select> is compact on every screen size and gets the OS picker for free
  // on mobile, so this replaces chipGroup() everywhere in this file.
  const selectField = (key, options) => (
    <select
      className={styles.selectInput}
      value={sel[key]}
      onChange={(e) => setSel(s => ({ ...s, [key]: e.target.value }))}
    >
      {options.map(o => (
        <option key={o.v} value={o.v}>{o.dot ? '● ' : ''}{o.label}</option>
      ))}
    </select>
  );

  const groupHead = (label, tipText, hint, tipTextHi) => (
    <div className={styles.groupHead}>
      <span className={styles.groupLabel}>{label}</span>
      {tipText && <InfoDot text={tipText} textHi={tipTextHi} />}
      {hint && <span className={styles.groupHint}>{hint}</span>}
    </div>
  );


  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Sparkles size={13} className={styles.sparkIcon} />
        <span className={styles.headerText}>Generate AI Model</span>
        <span className={styles.usageBadge}>{remaining} credit{remaining === 1 ? '' : 's'} left</span>
      </div>

      {!hasFeature(store, 'ai_studio_suite') ? (
        <div className={styles.upgradeNote}>
          AI model generation is part of Studio Suite. Upgrade your plan to generate campaign-quality model photos.
        </div>
      ) : (
        <>
          <p className={styles.hint}>
            Upload a jewellery photo, tune the model below, then generate. Leave anything on “Auto” to let AI decide.
          </p>

          {/* Source image upload */}
          {!srcPreview && (
            <div className={styles.dropZoneWrap}>
              <div
                className={styles.dropZone}
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <Upload size={22} strokeWidth={1.5} className={styles.dropIcon} />
                <span>Click or drag jewellery photo here</span>
                <small>JPG, PNG, WebP · Max 5 MB</small>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0])}
                />
              </div>
              <button
                type="button"
                className={styles.camBtn}
                onClick={() => camRef.current?.click()}
                title="Take photo with camera"
              >
                <Camera size={15} strokeWidth={1.5} /> Camera
              </button>
              <button
                type="button"
                className={styles.camBtn}
                onClick={() => setLibOpen(true)}
                title="Pick from your Studio Library"
              >
                <Sparkles size={15} strokeWidth={1.5} /> Library
              </button>
              <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {srcPreview && (
            <>
              {/* Uploaded jewellery thumb */}
              <div className={styles.upRow}>
                <div className={styles.upThumbWrap}>
                  <img src={srcPreview} alt="jewellery" className={styles.upThumb} />
                  {!generating && (
                    <button className={styles.removeBtn} onClick={reset} title="Remove">
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className={styles.upMeta}>
                  <b>Jewellery photo ready</b>
                  <span>Category: {category || '—'}</span>
                </div>
              </div>

              {/* ── Occasion (top) ── */}
              <div className={styles.occasionBox}>
                {groupHead('Occasion', 'Pick the occasion first. One tap sets a matching outfit, background and mood below — you can still change any of them after.', null, 'सबसे पहले मौका चुनें। एक टैप से नीचे मैचिंग आउटफिट, बैकग्राउंड और मूड अपने आप सेट हो जाता है — आप इन्हें बाद में बदल भी सकते हैं।')}
                {selectField('occasion', OCCASIONS)}
              </div>

              {/* ── Core controls ── */}
              <div className={styles.group}>
                {groupHead('Model', 'Who wears the jewellery in the photo.', null, 'फोटो में ज्वेलरी कौन पहनेगा।')}
                {selectField('model_gender', MODELS)}
              </div>

              <div className={styles.group}>
                {groupHead('Skin tone', 'Show your jewellery on the complexion your customers actually have — gold and diamond read very differently on fair vs deep skin.', null, 'अपनी ज्वेलरी को उस स्किन टोन पर दिखाएं जो आपके ग्राहकों की असल में है — गोल्ड और डायमंड फेयर और डार्क स्किन पर अलग-अलग दिखते हैं।')}
                {selectField('skin_tone', SKIN)}
              </div>

              <div className={styles.group}>
                {groupHead('Framing', "How much of the model is in the photo. Tighter crops keep all attention on the jewellery. 'Hands only' / 'Neck only' crop out the face entirely.", null, 'फोटो में मॉडल का कितना हिस्सा दिखे। टाइट क्रॉप से पूरा ध्यान ज्वेलरी पर रहता है। "Hands only" / "Neck only" में चेहरा बिल्कुल नहीं दिखता।')}
                {selectField('framing', FRAMING)}
              </div>

              <div className={styles.group}>
                {groupHead('Pose / angle', 'The angle the model faces. Side profile shows off earrings, nose pins and maang tikka best.', null, 'मॉडल किस एंगल पर है। साइड प्रोफाइल में इयररिंग, नोज़ पिन और मांग टीका सबसे अच्छे दिखते हैं।')}
                {selectField('pose', POSE)}
              </div>

              <div className={styles.group}>
                {groupHead('Attire', 'The outfit the model wears, and its colour. A neckline and colour that complement your metal make the jewellery pop.', null, 'मॉडल जो आउटफिट पहनेगा, और उसका रंग। मेटल से मैच करती नेकलाइन और रंग से ज्वेलरी और उभरकर दिखती है।')}
                {selectField('attire', ATTIRE)}
                <label className={styles.subFieldLabel}>Outfit colour</label>
                {selectField('attire_color', ATTIRE_COLOR)}
              </div>

              <div className={styles.group}>
                {groupHead('Background', 'The setting behind the model. Plain studio looks are clean for catalogues; lifestyle backdrops tell a story for social media.', null, 'मॉडल के पीछे की सेटिंग। सादा स्टूडियो लुक कैटलॉग के लिए साफ़ रहता है; लाइफस्टाइल बैकड्रॉप सोशल मीडिया के लिए एक कहानी बताता है।')}
                {selectField('background', BACKGROUND)}
                {sel.background === 'brand' && (
                  <label className={styles.brandColorRow}>
                    <span>Brand colour:</span>
                    <input
                      type="color"
                      className={styles.swatchInput}
                      value={sel.brand_color}
                      onChange={e => setSel(s => ({ ...s, brand_color: e.target.value }))}
                    />
                    <code>{sel.brand_color}</code>
                  </label>
                )}
              </div>

              {/* ── Advanced options — always visible, not tucked behind a
                  toggle, since dropdowns take almost no vertical space. ── */}
              <div className={styles.advBody}>
                <div className={styles.group}>
                  {groupHead('Aspect ratio', "The shape of the final image — match it to where you'll post. 9:16 for a WhatsApp / Instagram Story, square for the feed.", null, 'फाइनल फोटो का शेप — जहां पोस्ट करना है उसी के हिसाब से चुनें। WhatsApp / Instagram Story के लिए 9:16, फीड के लिए स्क्वायर।')}
                  {selectField('aspect', ASPECT)}
                </div>
                <div className={styles.group}>
                  {groupHead('Lighting / look', 'The overall mood of the photo — from bright catalogue lighting to dramatic editorial shadows.', null, 'फोटो का पूरा मूड — तेज़ कैटलॉग लाइटिंग से लेकर ड्रामैटिक एडिटोरियल शैडो तक।')}
                  {selectField('lighting', LIGHTING)}
                </div>
              </div>

              {/* ── Custom note ── */}
              <div className={styles.group}>
                {groupHead('Custom note', "Type anything the buttons above don't cover, in plain language. The AI will try to follow it.", 'optional', 'ऊपर के बटन जो कवर नहीं करते, वह यहां अपने शब्दों में लिखें। AI उसे फॉलो करने की कोशिश करेगा।')}
                <textarea
                  className={styles.note}
                  placeholder="e.g. open hair, red bindi, temple jewellery vibe, soft smile…"
                  maxLength={300}
                  value={sel.custom_note}
                  onChange={e => setSel(s => ({ ...s, custom_note: e.target.value }))}
                />
              </div>

              {/* ── Results ── */}
              {(generating || results.length > 0) && (
                <div className={styles.resultsBlock}>
                  <div className={styles.resultsHead}>
                    {generating
                      ? `Generating ${sel.photos} photo${sel.photos > 1 ? 's' : ''}…`
                      : results.length > 1
                        ? 'Pick the photos to add to your product'
                        : 'Your AI model'}
                  </div>
                  <div className={styles.resultsGrid} data-multi={(generating ? sel.photos : results.length) > 1}>
                    {generating
                      ? Array.from({ length: sel.photos }).map((_, i) => (
                          <div key={i} className={styles.resultCell}>
                            <div className={styles.generatingBox}>
                              <div className="spinner" />
                              <small>30–60s</small>
                            </div>
                          </div>
                        ))
                      : results.map(({ url, added }) => (
                          <div key={url} className={styles.resultCell}>
                            <div className={styles.imgWrap}>
                              <img src={url} alt="AI model" className={styles.resultImg} />
                              <button className={styles.maximizeBtn} onClick={() => setLightbox(url)} title="View full size">
                                <Maximize2 size={12} />
                              </button>
                            </div>
                            {added ? (
                              <span className={styles.addedBadge}>✓ Added</span>
                            ) : (
                              <button className={styles.addBtnSm} onClick={() => handleAddToProduct(url)}>
                                <PlusCircle size={13} /> {addLabel}
                              </button>
                            )}
                          </div>
                        ))}
                  </div>
                </div>
              )}

              {resultGrade === 'free' && results.length > 0 && (
                <div className={styles.freeNote}>
                  Made with a free credit, so these carry our watermark. Buy any credit pack and
                  every image you've made so far unlocks clean.
                </div>
              )}

              {error && (
                <div className={styles.errorRow}>
                  <AlertCircle size={13} />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Actions ── */}
              <div className={styles.actions}>
                <button className={styles.generateBtn} onClick={generate} disabled={generating || !canUse}>
                  {generating ? (
                    <><div className="spinner spinner-sm" /> Generating…</>
                  ) : results.length > 0 ? (
                    <><RefreshCw size={13} /> Regenerate</>
                  ) : (
                    <><Sparkles size={13} /> Generate AI Model</>
                  )}
                </button>

                <div className={styles.photosWrap}>
                  <span className={styles.photosLabel}>Photos</span>
                  <InfoDot
                    text="How many photos to generate in one go. More photos give you variety to choose from, but use up more of your monthly quota."
                    textHi="एक बार में कितनी फोटो बनानी हैं। ज़्यादा फोटो से आपको चुनने के लिए ज़्यादा विकल्प मिलते हैं, पर आपके मासिक कोटे से ज़्यादा इस्तेमाल होता है।"
                  />
                  <div className={styles.photoToggle}>
                    {PHOTOS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`${styles.photoBtn} ${sel.photos === p ? styles.photoBtnActive : ''}`}
                        onClick={() => setSel(s => ({ ...s, photos: p }))}
                        disabled={generating}
                        title={`Generate ${p} photo${p > 1 ? 's' : ''}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!canUse && (
                <div className={styles.upgradeNote}>
                  You’re out of credits. Credit packs are coming soon — meanwhile, use Refer &amp; Earn to get 10 free credits.
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className={styles.lightboxOverlay} onClick={() => { setLightbox(null); setShareOpen(false); }}>
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={() => { setLightbox(null); setShareOpen(false); }}>
              <X size={18} />
            </button>
            <img src={lightboxUrl} alt="AI model full size" className={styles.lightboxImg} />
            <div className={styles.lightboxActions}>
              {!results.find(r => r.url === lightboxUrl)?.added ? (
                <button className={styles.addBtn} onClick={() => { handleAddToProduct(lightboxUrl); }}>
                  <PlusCircle size={13} /> {addLabel}
                </button>
              ) : (
                <span className={styles.addedBadge}>✓ Added to images</span>
              )}
              <div className={styles.shareWrap}>
                <button className={styles.shareBtn} onClick={() => handleNativeShare(lightboxUrl)}>
                  <Share2 size={13} /> Share
                </button>
                {shareOpen && (
                  <div className={styles.shareMenu}>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('whatsapp', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: '#25D366' }}>W</span> WhatsApp
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('gmail', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: '#EA4335' }}>G</span> Gmail
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('instagram', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>I</span> Instagram
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleShare('twitter', lightboxUrl)}>
                      <span className={styles.shareIcon} style={{ background: '#000' }}>𝕏</span> Twitter / X
                    </button>
                    <button className={styles.shareMenuItem} onClick={() => handleCopyLink(lightboxUrl)}>
                      {copied ? <><Check size={12} color="#166534" /> Copied!</> : <><Copy size={12} /> Copy Link</>}
                    </button>
                  </div>
                )}
              </div>
              <button className={styles.copyBtnLb} onClick={() => handleCopyLink(lightboxUrl)}>
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy Link</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {libOpen && (
        <StudioLibraryPicker onClose={() => setLibOpen(false)} onPick={pickFromLibrary} />
      )}
    </div>
  );
}
