import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Gem, ArrowLeft, Sparkles, RefreshCw, Upload, X, Maximize2, Download, AlertCircle, Wand2,
} from 'lucide-react';
import { db, N8N_DESIGN_GENERATE, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { canUseSuite, suiteUsageText, chargeSuite } from '../lib/studioSuite';
import { compressImage } from '../lib/imageUtils';
import { composeDesignPrompt } from '../lib/designPrompt';
import {
  PIECE_TYPES, EARRING_SUBTYPES, STYLES, METAL_TYPES, PURITIES, FINISHES,
  STONE_TYPES, MOTIFS, OCCASIONS,
} from '../lib/designTaxonomy';
import { SuiteFeatureHeader } from './StudioSuite';
import styles from './DesignStudio.module.css';

/**
 * Jewellery Design (Studio Suite site edition).
 *
 * A focused generate-and-save flow: fill the spec fields (or upload a reference),
 * generate a photorealistic render via the SAME proven n8n workflow
 * (swarnix-design-generate-v2) and the SAME prompt composer the mobile/owner
 * apps use, then auto-save every render to the shared Library (app_gallery,
 * kind='design'). No catalogue publishing or pricing — that lives in the full
 * Swarnix owner product, not the Studio Suite site.
 */

function freshParams() {
  return {
    piece_type: '',
    earring_subtype: '',
    style: 'Contemporary / Minimalist',
    metal_type: 'Yellow Gold',
    purity: '22K',
    finish: 'High polish',
    hallmark: true,
    center: { stone_type: 'None' },
    motifs: [],
    motif_custom: '',
    occasion: '',
    extra_details: '',
  };
}

// Upload a File/Blob to Cloudinary (unsigned preset) — for the reference image
// and the b64 generation fallback.
async function uploadToCloudinary(fileOrBlob, filename = 'design.jpg') {
  const compressed = await compressImage(fileOrBlob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-designs');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return (await res.json()).secure_url;
}

export default function DesignStudio({ onBack }) {
  const { store, refreshStore } = useAuth();

  const [params, setParams] = useState(freshParams);
  const [mode, setMode] = useState('scratch');          // 'scratch' | 'reference'
  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);

  const [generating, setGenerating] = useState(false);
  const [renders, setRenders] = useState([]);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const fileRef = useRef(null);
  const objectUrlRef = useRef(null);

  const canUse = canUseSuite(store, 1);
  const usageText = suiteUsageText(store);

  const set = (patch) => setParams((p) => ({ ...p, ...patch }));

  const pickReference = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) { setError('Please choose an image file.'); return; }
    setError(null);
    setReferenceFile(file);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setReferencePreview(objectUrlRef.current);
  };
  const clearReference = () => {
    setReferenceFile(null);
    setReferencePreview(null);
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
  };
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const toggleMotif = (m) => setParams((p) => ({
    ...p,
    motifs: p.motifs.includes(m) ? p.motifs.filter((x) => x !== m) : [...p.motifs, m],
  }));

  const runGenerate = useCallback(async (variation = false) => {
    if (!params.piece_type) { setError('Pick a piece type first.'); return; }
    if (mode === 'reference' && !referenceFile) { setError('Upload a reference image, or switch to “From scratch”.'); return; }
    if (!canUse) return;

    setGenerating(true);
    setError(null);
    try {
      const prompt = composeDesignPrompt(params, { mode });
      const fd = new FormData();
      fd.append('owner_id', store.owner_id);
      fd.append('prompt', prompt);
      fd.append('mode', mode);
      fd.append('variation', variation ? '1' : '0');
      if (mode === 'reference' && referenceFile) fd.append('reference', referenceFile);

      const res = await fetch(N8N_DESIGN_GENERATE, { method: 'POST', body: fd, credentials: 'omit', mode: 'cors' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Generation failed (${res.status})${t ? ': ' + t.slice(0, 120) : ''}`);
      }
      const data = await res.json();

      let urls = [];
      if (Array.isArray(data?.renders)) urls = data.renders.filter(Boolean);
      else if (data?.result_url) urls = [data.result_url];
      else if (data?.secure_url) urls = [data.secure_url];
      else if (data?.data?.[0]?.b64_json) {
        const b64 = data.data[0].b64_json;
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const url = await uploadToCloudinary(new Blob([arr], { type: 'image/jpeg' }), `design_${store.owner_id}_${Date.now()}.jpg`);
        urls = [url];
      }
      if (!urls.length) throw new Error('No image was returned. Please try again.');

      setRenders(urls);

      // Charge one credit per render produced, then auto-save to the Library.
      await chargeSuite(store.owner_id, urls.length);
      const title = [params.style, params.earring_subtype, params.piece_type].filter(Boolean).join(' ') || 'Jewellery Design';
      try {
        await db.from('app_gallery').insert(
          urls.map((u) => ({ user_id: store.owner_id, image_url: u, title, kind: 'design' }))
        );
      } catch { /* non-fatal — the render is still shown */ }
      await refreshStore();
    } catch (e) {
      setError(e.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [params, mode, referenceFile, canUse, store, refreshStore]);

  const resetForm = () => {
    setParams(freshParams());
    setMode('scratch');
    clearReference();
    setRenders([]);
    setError(null);
  };

  const isEarrings = params.piece_type === 'Earrings';
  const generateDisabled = generating || !canUse || !params.piece_type || (mode === 'reference' && !referenceFile);

  return (
    <div className={styles.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={Gem}
        title="Jewellery Design"
        sub="Describe a piece — or upload a reference — and generate a photorealistic render."
        right={usageText ? <span className={styles.usage}>{usageText}</span> : null}
      />

      {!canUse && (
        <div className={styles.limitNote}>
          You’re out of credits. Buy more to keep generating designs.
        </div>
      )}

      <div className={styles.layout}>
        {/* ── Left: form ── */}
        <div className={styles.col}>
          {/* Mode toggle */}
          <div className={styles.modeRow}>
            <button
              className={`${styles.modeBtn} ${mode === 'scratch' ? styles.modeActive : ''}`}
              onClick={() => setMode('scratch')}
            >
              <Wand2 size={14} /> From scratch
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'reference' ? styles.modeActive : ''}`}
              onClick={() => setMode('reference')}
            >
              <Upload size={14} /> From a reference
            </button>
          </div>

          {mode === 'reference' && (
            <div className={styles.group}>
              <span className={styles.groupLabel}>Reference image</span>
              {!referencePreview ? (
                <div className={styles.dropZone} onClick={() => fileRef.current?.click()}>
                  <Upload size={20} strokeWidth={1.5} />
                  <span>Upload a photo to reinterpret</span>
                  <small>JPG, PNG, WebP</small>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => pickReference(e.target.files?.[0])} />
                </div>
              ) : (
                <div className={styles.refThumbWrap}>
                  <img src={referencePreview} alt="reference" className={styles.refThumb} />
                  <button className={styles.removeBtn} onClick={clearReference}><X size={11} /></button>
                </div>
              )}
            </div>
          )}

          <div className={styles.group}>
            <span className={styles.groupLabel}>Piece type</span>
            <select className={styles.select} value={params.piece_type} onChange={(e) => set({ piece_type: e.target.value })}>
              <option value="">Choose a piece…</option>
              {PIECE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {isEarrings && (
            <div className={styles.group}>
              <span className={styles.groupLabel}>Earring type</span>
              <div className={styles.chips}>
                {EARRING_SUBTYPES.map((s) => (
                  <button key={s} className={`${styles.chip} ${params.earring_subtype === s ? styles.chipActive : ''}`}
                    onClick={() => set({ earring_subtype: s })}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.group}>
            <span className={styles.groupLabel}>Style</span>
            <select className={styles.select} value={params.style} onChange={(e) => set({ style: e.target.value })}>
              {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className={styles.rowTwo}>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Metal</span>
              <select className={styles.select} value={params.metal_type} onChange={(e) => set({ metal_type: e.target.value })}>
                {METAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Purity</span>
              <select className={styles.select} value={params.purity} onChange={(e) => set({ purity: e.target.value })}>
                {PURITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.rowTwo}>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Finish</span>
              <select className={styles.select} value={params.finish} onChange={(e) => set({ finish: e.target.value })}>
                {FINISHES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Centre stone</span>
              <select className={styles.select} value={params.center.stone_type}
                onChange={(e) => set({ center: { ...params.center, stone_type: e.target.value } })}>
                {STONE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.groupLabel}>Motifs <small className={styles.optional}>· optional</small></span>
            <div className={styles.chips}>
              {MOTIFS.map((m) => (
                <button key={m} className={`${styles.chip} ${params.motifs.includes(m) ? styles.chipActive : ''}`}
                  onClick={() => toggleMotif(m)}>{m}</button>
              ))}
            </div>
            {params.motifs.includes('Custom') && (
              <input className={styles.input} placeholder="Describe your custom motif…"
                value={params.motif_custom} onChange={(e) => set({ motif_custom: e.target.value })} />
            )}
          </div>

          <div className={styles.group}>
            <span className={styles.groupLabel}>Occasion <small className={styles.optional}>· optional</small></span>
            <div className={styles.chips}>
              {OCCASIONS.map((o) => (
                <button key={o} className={`${styles.chip} ${params.occasion === o ? styles.chipActive : ''}`}
                  onClick={() => set({ occasion: params.occasion === o ? '' : o })}>{o}</button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.groupLabel}>Anything else? <small className={styles.optional}>· optional</small></span>
            <textarea className={styles.textarea} maxLength={300}
              placeholder="e.g. small diamonds hanging at the bottom, open jaali work, matching studs…"
              value={params.extra_details} onChange={(e) => set({ extra_details: e.target.value })} />
          </div>

          <button className={styles.generateBtn} onClick={() => runGenerate(false)} disabled={generateDisabled}>
            {generating ? (<><div className="spinner spinner-sm" /> Generating…</>)
              : renders.length ? (<><RefreshCw size={14} /> Regenerate</>)
              : (<><Sparkles size={14} /> Generate design · 1 credit</>)}
          </button>
          {renders.length > 0 && (
            <button className={styles.secondaryBtn} onClick={resetForm}>Start a new design</button>
          )}
        </div>

        {/* ── Right: output ── */}
        <div className={styles.col}>
          <div className={styles.resultBox}>
            {generating ? (
              <div className={styles.resultPlaceholder}><div className="spinner" /><small>30–60s</small></div>
            ) : renders.length ? (
              <div className={styles.resultGrid} data-multi={renders.length > 1}>
                {renders.map((url) => (
                  <div key={url} className={styles.resultWrap}>
                    <img src={url} alt="design" className={styles.resultImg} />
                    <button className={styles.maximizeBtn} onClick={() => setLightbox(url)}><Maximize2 size={13} /></button>
                    <a className={styles.dlBtn} href={url} target="_blank" rel="noreferrer" download><Download size={13} /> Open</a>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.resultPlaceholder}><Gem size={22} strokeWidth={1.4} /><span>Your design appears here</span></div>
            )}
          </div>
          {renders.length > 0 && (
            <button className={styles.variationBtn} onClick={() => runGenerate(true)} disabled={generating || !canUse}>
              <Sparkles size={13} /> Generate a variation
            </button>
          )}
          {error && <div className={styles.errorRow}><AlertCircle size={13} /><span>{error}</span></div>}
        </div>
      </div>

      {lightbox && (
        <div className={styles.lbOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lbContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lbClose} onClick={() => setLightbox(null)}><X size={18} /></button>
            <img src={lightbox} alt="design full" className={styles.lbImg} />
          </div>
        </div>
      )}
    </div>
  );
}
