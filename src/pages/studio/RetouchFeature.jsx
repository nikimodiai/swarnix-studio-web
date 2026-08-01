import React, { useCallback, useRef, useState } from 'react';
import { Upload, Camera, X, Sparkles, RefreshCw, AlertCircle, Maximize2, Download, Images } from 'lucide-react';
import { MAX_IMAGE_BYTES } from '../../lib/config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { canUseSuite, suiteUsageText, chargeSuiteGraded } from '../../lib/studioSuite';
import { hasFeature } from '../../lib/plans';
import {
  uploadRetouchImage, runRetouch, CUSTOM_OPTION,
  PIECE_TYPES, DEFAULT_PIECE_TYPE, WORN_PIECE_TYPES,
  WORN_BACKDROP_COLORS, DEFAULT_WORN_BACKDROP,
} from '../../lib/retouch';
import { deleteTempUpload } from '../../lib/imageUtils';
import { publicIdFromUrl } from '../../lib/watermark';
import GuideButton from '../../components/GuideButton';
import InfoDot from '../../components/InfoDot';
import { saveGeneration } from '../../lib/watermark';
import { logGeneration, markDownloaded } from '../../lib/analytics';
import { SuiteFeatureHeader } from '../StudioSuite';
import StudioLibraryPicker from '../../components/StudioLibraryPicker';
import hub from '../StudioSuite.module.css';
import styles from './RetouchFeature.module.css';

/**
 * Shared screen for the two single-image retouch features:
 *   • Studio Photo  → mode 'retouch', pick a background style.
 *   • Metal Swap    → mode 'variant', pick a target metal (+ optional background).
 * Both call the SAME n8n /retouch workflow and save to app_gallery with their
 * own `kind`. Charges the shared Studio Suite meter (1 Studio credit) on success.
 *
 * Props: { onBack, mode, kind, icon, title, sub, styleOptions, defaultStyle,
 *          metalOptions?, defaultMetal? }
 */
export default function RetouchFeature({
  onBack, mode, kind, icon, title, sub,
  styleOptions, defaultStyle, metalOptions, defaultMetal,
}) {
  const { store } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const [srcFile, setSrcFile] = useState(null);   // device file (needs upload)
  const [srcUrl, setSrcUrl] = useState(null);      // already-hosted URL (library pick)
  const [srcPreview, setSrcPreview] = useState(null);
  const [style, setStyle] = useState(defaultStyle);
  const [styleCustom, setStyleCustom] = useState('');
  const [metal, setMetal] = useState(defaultMetal || null);
  const [metalCustom, setMetalCustom] = useState('');
  const [pieceType, setPieceType] = useState(DEFAULT_PIECE_TYPE);
  const [worn, setWorn] = useState(false);
  const [backdropColor, setBackdropColor] = useState(DEFAULT_WORN_BACKDROP);
  const [backdropColorCustom, setBackdropColorCustom] = useState('');
  const canWear = WORN_PIECE_TYPES.includes(pieceType);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  // 'free' once we know this generation was paid for from the free allowance —
  // its library copy and download are watermarked until the user buys.
  const [resultGrade, setResultGrade] = useState(null);
  // Analytics row for the current result, so a download can be attributed to it.
  const [eventId, setEventId] = useState(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const [libOpen, setLibOpen] = useState(false);

  const featureOn = hasFeature(store, 'ai_studio_suite');
  const canUse = canUseSuite(store, 1);
  const usageText = suiteUsageText(store);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { setError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`); return; }
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    setError(null);
    setResult(null); setResultGrade(null); setEventId(null);
    setSrcUrl(null);
    setSrcFile(file);
    setSrcPreview(URL.createObjectURL(file));
  };

  // Picked an already-generated image from the Studio Library — it's already a
  // hosted URL, so no upload is needed.
  const pickFromLibrary = (url) => {
    setError(null);
    setResult(null); setResultGrade(null); setEventId(null);
    setSrcFile(null);
    setSrcUrl(url);
    setSrcPreview(url);
    setLibOpen(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  const reset = () => {
    setSrcFile(null);
    setSrcUrl(null);
    setSrcPreview(null);
    setResult(null); setResultGrade(null); setEventId(null);
    setError(null);
    setStyleCustom(''); setMetalCustom('');
    setPieceType(DEFAULT_PIECE_TYPE); setWorn(false);
    setBackdropColor(DEFAULT_WORN_BACKDROP); setBackdropColorCustom('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const generate = async () => {
    if ((!srcFile && !srcUrl) || !canUse || busy) return;
    setBusy(true);
    setError(null);
    setResult(null); setResultGrade(null); setEventId(null);
    const startedAt = Date.now();
    let imageUrl = srcUrl;
    // Library picks are already hosted (srcUrl set); device files need a
    // Cloudinary upload, and that upload is a TEMP source — deleted in
    // `finally` once this generation finishes, since it's not the user's
    // library (a Library pick must never be deleted here).
    const wasDeviceUpload = !srcUrl;
    try {
      imageUrl = srcUrl || await uploadRetouchImage(srcFile, `${kind}_${store.owner_id}_${Date.now()}.webp`);
      const url = await runRetouch({
        ownerId: store.owner_id,
        imageUrl,
        mode,
        style,
        styleCustom,
        targetMetal: mode === 'variant' ? metal : undefined,
        targetMetalCustom: metalCustom,
        pieceType,
        worn: canWear && worn,
        backdropColor: canWear && worn ? backdropColor : undefined,
        backdropColorCustom: canWear && worn ? backdropColorCustom : undefined,
      });
      setResult(url);

      // Charge one Studio credit, then save to the shared library at the grade
      // the charge actually drew from — free-grade output gets watermarked.
      const { grade } = await chargeSuiteGraded(store.owner_id, 1);
      const label = mode === 'variant'
        ? (metal === CUSTOM_OPTION ? metalCustom.trim() || 'Custom' : metalOptions?.find((m) => m.v === metal)?.label || metal)
        : (style === CUSTOM_OPTION ? styleCustom.trim() || 'Custom' : styleOptions?.find((s) => s.v === style)?.label || style);
      try {
        const { displayUrl } = await saveGeneration({
          url,
          grade,
          user_id: store.owner_id,
          title: `${title} · ${label}`,
          kind,
        });
        // Show exactly what was saved, so the preview and the download match.
        if (displayUrl) setResult(displayUrl);
      } catch { /* non-fatal */ }
      setResultGrade(grade);

      // Analytics — fire-and-forget, never awaited on the happy path.
      logGeneration({
        feature: kind,
        sourceUrl: imageUrl,
        creditGrade: grade,
        creditsConsumed: 1,
        latencyMs: Date.now() - startedAt,
      }).then(setEventId);
    } catch (e) {
      setError(e.message || 'Generation failed. Please try again.');
      logGeneration({
        feature: kind,
        status: 'failed',
        sourceUrl: imageUrl,
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      setBusy(false);
      if (wasDeviceUpload) deleteTempUpload(publicIdFromUrl(imageUrl));
    }
  };

  const chipRow = (options, value, onPick) => (
    <div className={styles.chips}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`${styles.chip} ${value === o.v ? styles.chipActive : ''}`}
          onClick={() => onPick(o.v)}
          title={o.tip}
        >
          {o.dot && <span className={styles.dot} style={{ background: o.dot }} />}
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={icon} title={title} sub={sub}
        right={(
          <div className={hub.headerRight}>
            {usageText && <span className={styles.usage}>{usageText}</span>}
            <GuideButton id={kind} />
          </div>
        )}
      />

      {!featureOn ? (
        <div className={hub.lock}>
          <Sparkles size={28} strokeWidth={1.4} />
          <h2>{title} isn’t available on your plan</h2>
          <p>Upgrade your plan to use AI Studio Suite.</p>
        </div>
      ) : (
        <div className={styles.layout}>
          {/* Left: source + controls */}
          <div className={styles.col}>
            {!srcPreview ? (
              <div className={styles.dropWrap}>
                <div
                  className={styles.dropZone}
                  onClick={() => fileRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <Upload size={22} strokeWidth={1.5} />
                  <span>Click or drag your jewellery photo here</span>
                  <small>JPG, PNG, WebP · Max 5 MB</small>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => handleFile(e.target.files?.[0])} />
                </div>
                <div className={styles.srcBtns}>
                  <button type="button" className={styles.camBtn} onClick={() => camRef.current?.click()}>
                    <Camera size={15} /> Camera
                  </button>
                  <button type="button" className={styles.camBtn} onClick={() => setLibOpen(true)}>
                    <Images size={15} /> Library
                  </button>
                </div>
                <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={(e) => handleFile(e.target.files?.[0])} />
              </div>
            ) : (
              <div className={styles.srcRow}>
                <div className={styles.srcThumbWrap}>
                  <img src={srcPreview} alt="source" className={styles.srcThumb} />
                  {!busy && <button className={styles.removeBtn} onClick={reset} title="Remove"><X size={11} /></button>}
                </div>
                <div className={styles.srcMeta}><b>Photo ready</b><span>Tune the options, then generate.</span></div>
              </div>
            )}

            {srcPreview && (
              <>
                <div className={styles.group}>
                  <span className={styles.groupLabel}>
                    Piece type
                    <InfoDot
                      text="Necklaces and necklace sets can be shown worn on a model against a coloured backdrop."
                      textHi="नेकलेस और नेकलेस सेट को मॉडल पर पहना हुआ, रंगीन बैकड्रॉप के साथ दिखाया जा सकता है।"
                    />
                  </span>
                  {chipRow(PIECE_TYPES, pieceType, (v) => { setPieceType(v); if (!WORN_PIECE_TYPES.includes(v)) setWorn(false); })}
                </div>

                {canWear && (
                  <div className={styles.group}>
                    <label className={styles.groupLabel} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={worn} onChange={(e) => setWorn(e.target.checked)} />
                      {' '}Show worn, on a coloured backdrop
                    </label>
                    {worn && (
                      <>
                        {chipRow(WORN_BACKDROP_COLORS, backdropColor, setBackdropColor)}
                        {backdropColor === CUSTOM_OPTION && (
                          <input className={styles.customInput} maxLength={150}
                            placeholder="Describe the backdrop colour / fabric you want…"
                            value={backdropColorCustom} onChange={(e) => setBackdropColorCustom(e.target.value)} />
                        )}
                      </>
                    )}
                  </div>
                )}

                {mode === 'variant' && metalOptions && (
                  <div className={styles.group}>
                    <span className={styles.groupLabel}>
                      Target metal
                      <InfoDot
                        text="The metal colour the piece will be shown in — the design, stones and setting stay the same."
                        textHi="जिस रंग के मेटल में पीस दिखाना है — डिज़ाइन, स्टोन और सेटिंग वही रहेंगे।"
                      />
                    </span>
                    {chipRow(metalOptions, metal, setMetal)}
                    {metal === CUSTOM_OPTION && (
                      <input className={styles.customInput} maxLength={150}
                        placeholder="Describe the metal / finish you want…"
                        value={metalCustom} onChange={(e) => setMetalCustom(e.target.value)} />
                    )}
                  </div>
                )}
                {!(canWear && worn) && (
                  <div className={styles.group}>
                    <span className={styles.groupLabel}>
                      {mode === 'variant' ? 'Background' : 'Studio background'}
                      <InfoDot
                        text="The backdrop and lighting behind your jewellery in the final photo."
                        textHi="फाइनल फोटो में आपकी ज्वेलरी के पीछे का बैकड्रॉप और लाइटिंग।"
                      />
                    </span>
                    {chipRow(styleOptions, style, setStyle)}
                    {style === CUSTOM_OPTION && (
                      <input className={styles.customInput} maxLength={150}
                        placeholder="Describe the background you want…"
                        value={styleCustom} onChange={(e) => setStyleCustom(e.target.value)} />
                    )}
                  </div>
                )}

                <button className={styles.generateBtn} onClick={generate} disabled={busy || !canUse}>
                  {busy ? (<><div className="spinner spinner-sm" /> Generating…</>)
                    : result ? (<><RefreshCw size={14} /> Regenerate</>)
                    : (<><Sparkles size={14} /> Generate</>)}
                </button>
                {!canUse && (
                  <div className={styles.limitNote}>
                    You’ve used all your Studio credits this month. They reset next cycle or after an upgrade.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: result */}
          <div className={styles.col}>
            <div className={styles.resultBox}>
              {busy ? (
                <div className={styles.resultPlaceholder}><div className="spinner" /><small>30–60s</small></div>
              ) : result ? (
                <div className={styles.resultWrap}>
                  <img src={result} alt="result" className={styles.resultImg} />
                  <button className={styles.maximizeBtn} onClick={() => setLightbox(true)} title="View full size"><Maximize2 size={13} /></button>
                  <a className={styles.dlBtn} href={result} target="_blank" rel="noreferrer" download
                     onClick={() => markDownloaded(eventId)}><Download size={13} /> Open</a>
                </div>
              ) : (
                <div className={styles.resultPlaceholder}><Sparkles size={22} strokeWidth={1.4} /><span>Your result appears here</span></div>
              )}
            </div>
            {resultGrade === 'free' && (
              <div className={styles.freeNote}>
                Made with a free credit, so it carries our watermark. Buy any credit pack and
                every image you've made so far unlocks clean — including this one.
              </div>
            )}
            {error && <div className={styles.errorRow}><AlertCircle size={13} /><span>{error}</span></div>}
          </div>
        </div>
      )}

      {lightbox && result && (
        <div className={styles.lbOverlay} onClick={() => setLightbox(false)}>
          <div className={styles.lbContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lbClose} onClick={() => setLightbox(false)}><X size={18} /></button>
            <img src={result} alt="result full" className={styles.lbImg} />
          </div>
        </div>
      )}

      {libOpen && (
        <StudioLibraryPicker onClose={() => setLibOpen(false)} onPick={pickFromLibrary} />
      )}
    </div>
  );
}
