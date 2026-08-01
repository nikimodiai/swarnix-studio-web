import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Layers, Upload, X, Sparkles, AlertCircle, Check, Loader2, RotateCcw, Gem,
  Download, Share2, Maximize2,
} from 'lucide-react';
import { MAX_IMAGE_BYTES } from '../../lib/config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { canUseSuite, suiteUnitsLeft } from '../../lib/studioSuite';
import { RETOUCH_STYLES, DEFAULT_STYLE, TARGET_METALS, DEFAULT_TARGET_METAL, METAL_SWAP_STYLES, CUSTOM_OPTION } from '../../lib/retouch';
import { CATEGORIES } from '../../lib/config';
import {
  MAX_BATCH_PIECES, COLLECTION_ELIGIBLE_FEATURES, uploadPieces, createBatch, runBatch,
  fetchCollections, createCollection,
} from '../../lib/batch';
import { downloadUrlFor } from '../../lib/watermark';
import { downloadMedia, shareToWhatsApp, nativeShareMedia } from '../../lib/share';
import { SuiteFeatureHeader } from '../StudioSuite';
import GuideButton from '../../components/GuideButton';
import InfoDot from '../../components/InfoDot';
import hub from '../StudioSuite.module.css';
import styles from './BatchStudio.module.css';

/**
 * Batch upload (P1-1) with optional collection model lock (P1-2, AI Model only).
 *
 * Up to 10 pieces, one shared settings panel, one credit each. Pieces are
 * persisted before generation starts, so closing the tab doesn't lose results —
 * they finish landing in the Library. Finished pieces render inline as a photo
 * grid on this same screen (not just a status list) so the user can act on them
 * without a trip to the Library.
 *
 * Collections only appear for AI Model: Studio Photo and Metal Swap transform
 * an existing product photo, so there's no model face to lock. See
 * COLLECTION_ELIGIBLE_FEATURES in lib/batch.js.
 *
 * MODEL_REFERENCE_NOTE (P1-2, IMPORTANT):
 * The collection's locked model is sent to n8n as `model_reference_url` on
 * every generation after the first. The swarnix-ai-model workflow must be
 * updated to read that field and pass the image to Gemini as an additional
 * input — n8n silently drops fields it doesn't reference, so until that change
 * lands the collection groups pieces correctly but the FACE WILL NOT stay
 * consistent. Everything on the app side is ready for it.
 */
export default function BatchStudio({ onBack, onNavigate }) {
  const { store, refreshStore } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef(null);

  const [feature, setFeature] = useState('studio_photo'); // studio_photo | metal_swap | ai_model
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [styleCustom, setStyleCustom] = useState('');
  const [metal, setMetal] = useState(DEFAULT_TARGET_METAL);
  const [metalCustom, setMetalCustom] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]?.value || 'Ring');
  const [pieces, setPieces] = useState([]);   // [{ file, preview, label }]
  const [items, setItems] = useState([]);     // live rows once submitted
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(null); // "3 / 10"
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [lightbox, setLightbox] = useState(null); // item id shown full-size

  // Collections (AI Model only)
  const [collections, setCollections] = useState([]);
  const [collectionId, setCollectionId] = useState('');   // '' = none
  const [newCollectionName, setNewCollectionName] = useState('');
  const collectionsEligible = COLLECTION_ELIGIBLE_FEATURES.has(feature);

  const credits = suiteUnitsLeft(store);
  const cost = pieces.length;
  const shortBy = Math.max(0, cost - credits);
  const doneCount = items.filter((i) => i.status === 'done').length;

  useEffect(() => {
    let active = true;
    fetchCollections()
      .then((c) => active && setCollections(c))
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Switching away from AI Model drops any chosen collection — it can't apply.
  useEffect(() => {
    if (!collectionsEligible) { setCollectionId(''); setNewCollectionName(''); }
  }, [collectionsEligible]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    setError(null);

    const room = MAX_BATCH_PIECES - pieces.length;
    if (room <= 0) { setError(`You can upload up to ${MAX_BATCH_PIECES} pieces at once.`); return; }

    const accepted = [];
    for (const file of incoming.slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`"${file.name}" is over 5 MB and was skipped.`);
        continue;
      }
      accepted.push({
        file,
        preview: URL.createObjectURL(file),
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
      });
    }
    if (incoming.length > room) setError(`Only the first ${room} of your ${incoming.length} photos were added — ${MAX_BATCH_PIECES} is the limit per batch.`);
    setPieces((prev) => [...prev, ...accepted]);
  }, [pieces.length]);

  const removePiece = (idx) => setPieces((prev) => prev.filter((_, i) => i !== idx));
  const setLabel = (idx, label) =>
    setPieces((prev) => prev.map((p, i) => (i === idx ? { ...p, label } : p)));

  const resetAll = () => {
    pieces.forEach((p) => URL.revokeObjectURL(p.preview));
    setPieces([]); setItems([]); setSummary(null); setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (pieces.length === 0 || running) return;
    if (shortBy > 0) return;
    setRunning(true);
    setError(null);
    setSummary(null);

    try {
      // 1. Resolve the collection (creating it if the user typed a new name).
      //    Only meaningful for ai_model — see collectionsEligible.
      let collection = collectionsEligible
        ? collections.find((c) => c.id === collectionId) || null
        : null;
      if (collectionsEligible && !collection && newCollectionName.trim()) {
        collection = await createCollection(newCollectionName, { feature });
        setCollections((prev) => [collection, ...prev]);
        setCollectionId(collection.id);
        setNewCollectionName('');
      }

      // 2. Upload every piece, then persist the batch BEFORE generating.
      setUploading(`0 / ${pieces.length}`);
      const uploaded = await uploadPieces(
        pieces.map((p) => p.file),
        store.owner_id,
        (done, total) => setUploading(`${done} / ${total}`)
      );
      setUploading(null);

      const withLabels = uploaded.map((u, i) => ({ ...u, label: pieces[i].label }));
      const settings = feature === 'ai_model'
        ? { category, aiModelSel: {} }
        : { style, styleCustom, targetMetal: feature === 'metal_swap' ? metal : null, targetMetalCustom: metalCustom };
      const { batchId, items: created } = await createBatch({
        feature, settings, collectionId: collection?.id || null, pieces: withLabels,
      });
      setItems(created.map((it) => ({ ...it, status: 'queued' })));

      // 3. Run them one at a time, updating each row as it resolves.
      const result = await runBatch({
        batchId,
        items: created,
        feature,
        settings,
        collection,
        ownerId: store.owner_id,
        onUpdate: (id, patch) =>
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
      });

      setSummary(result);
      await refreshStore();
      showToast(
        result.failed === 0
          ? `All ${result.succeeded} pieces done.`
          : `${result.succeeded} done, ${result.failed} failed — ${result.refunded} credit${result.refunded === 1 ? '' : 's'} refunded.`,
        result.failed === 0 ? '#166534' : '#1D4ED8'
      );
    } catch (e) {
      setError(e.message || 'Batch failed to start.');
    } finally {
      setUploading(null);
      setRunning(false);
    }
  };

  // Resolve the URL a finished item should actually be shared/downloaded as —
  // clean if this account has unlocked clean downloads, watermarked otherwise.
  // Batch items with a gallery_id go through the same gate as the Library.
  const resolveUrl = async (item) => {
    if (!item.gallery_id) return item.result_url;
    return (await downloadUrlFor({ id: item.gallery_id, image_url: item.result_url, credit_grade: 'free' })) || item.result_url;
  };

  const shareOne = async (item) => {
    setSharing(true);
    try {
      const url = await resolveUrl(item);
      const res = await nativeShareMedia([{ url, name: 'swarnix.jpg' }], { title: 'Swarnix' });
      if (res === 'unsupported') shareToWhatsApp(url);
    } finally { setSharing(false); }
  };

  const downloadOne = async (item) => {
    const url = await resolveUrl(item);
    downloadMedia(url, `${item.label || 'swarnix'}.jpg`);
  };

  const styleOptions = feature === 'metal_swap' ? METAL_SWAP_STYLES : RETOUCH_STYLES;
  const submitted = items.length > 0;
  const lightboxItem = items.find((i) => i.id === lightbox);

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={Layers} title="Batch Studio"
        sub={`Up to ${MAX_BATCH_PIECES} pieces in one go — same settings, same model.`}
        right={(
          <div className={hub.headerRight}>
            <span className={styles.usage}>{credits} credits left</span>
            <GuideButton id="batch" />
          </div>
        )}
      />

      <div className={styles.layout}>
        {/* ── Left: pieces / live results ── */}
        <div className={styles.col}>
          {!submitted && (
            <>
              <div
                className={styles.dropZone}
                onClick={() => fileRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload size={22} strokeWidth={1.5} />
                <span>Click or drag up to {MAX_BATCH_PIECES} jewellery photos</span>
                <small>JPG, PNG, WebP · Max 5 MB each</small>
                <input
                  ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {pieces.length > 0 && (
                <div className={styles.grid}>
                  {pieces.map((p, i) => (
                    <div key={i} className={styles.card}>
                      <div className={styles.cardImgWrap}>
                        <img src={p.preview} alt="" className={styles.cardImg} />
                        <button className={styles.cardDel} onClick={() => removePiece(i)} title="Remove">
                          <X size={13} />
                        </button>
                      </div>
                      <input
                        className={styles.cardLabel}
                        value={p.label}
                        onChange={(e) => setLabel(i, e.target.value)}
                        placeholder="SKU or piece name"
                        maxLength={60}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Live results once submitted — a real photo grid, not a status list */}
          {submitted && (
            <>
              {running && (
                <p className={styles.progressNote}>
                  {doneCount} / {items.length} done{uploading ? ` · uploading ${uploading}` : ''}
                </p>
              )}
              <div className={styles.grid}>
                {items.map((it) => (
                  <div key={it.id} className={styles.card}>
                    <div className={styles.cardImgWrap}>
                      <img
                        src={it.result_url || it.source_url}
                        alt=""
                        className={`${styles.cardImg} ${it.status === 'failed' ? styles.cardImgFail : ''}`}
                      />
                      {it.status === 'generating' && (
                        <div className={styles.cardOverlay}><Loader2 size={22} className={styles.spin} /></div>
                      )}
                      {it.status === 'done' && (
                        <>
                          <button className={styles.cardZoom} onClick={() => setLightbox(it.id)} title="View full size">
                            <Maximize2 size={13} />
                          </button>
                          <span className={styles.cardBadge}><Check size={11} /> Done</span>
                        </>
                      )}
                      {it.status === 'failed' && (
                        <span className={`${styles.cardBadge} ${styles.cardBadgeFail}`}><AlertCircle size={11} /> Failed</span>
                      )}
                    </div>
                    <div className={styles.cardFooter}>
                      <span className={styles.cardName}>{it.label || `Piece ${it.position + 1}`}</span>
                      {it.status === 'failed' && (
                        <span className={styles.cardErr}>
                          {it.error || 'Failed'}{it.credit_refunded ? ' · refunded' : ''}
                        </span>
                      )}
                      {it.status === 'done' && (
                        <div className={styles.cardActions}>
                          <button onClick={() => downloadOne(it)} title="Download"><Download size={13} /></button>
                          <button onClick={() => shareOne(it)} disabled={sharing} title="Share"><Share2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: shared settings ── */}
        <div className={styles.col}>
          <div className={styles.panel}>
            <label className={styles.field}>
              <span className={styles.fieldLabelRow}>
                What to do with every piece
                <InfoDot text="The feature applied to every photo in this batch." textHi="इस बैच की हर फोटो पर लागू होने वाला फीचर।" />
              </span>
              <select className={styles.input} value={feature} disabled={submitted}
                onChange={(e) => setFeature(e.target.value)}>
                <option value="studio_photo">Studio Photo — clean product shot</option>
                <option value="metal_swap">Metal Swap — change the metal</option>
                <option value="ai_model">AI Model — put it on a model</option>
              </select>
            </label>

            {feature === 'metal_swap' && (
              <label className={styles.field}>
                <span className={styles.fieldLabelRow}>
                  Target metal
                  <InfoDot text="The metal colour every piece in this batch will be shown in." textHi="इस बैच की हर फोटो किस रंग के मेटल में दिखेगी।" />
                </span>
                <select className={styles.input} value={metal} disabled={submitted}
                  onChange={(e) => setMetal(e.target.value)}>
                  {TARGET_METALS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
                {metal === CUSTOM_OPTION && (
                  <input className={styles.input} style={{ marginTop: 8 }} maxLength={150} disabled={submitted}
                    placeholder="Describe the metal / finish you want…"
                    value={metalCustom} onChange={(e) => setMetalCustom(e.target.value)} />
                )}
              </label>
            )}

            {feature !== 'ai_model' && (
              <label className={styles.field}>
                <span className={styles.fieldLabelRow}>
                  Background / scene
                  <InfoDot text="The backdrop applied to every piece in this batch." textHi="इस बैच की हर फोटो पर लागू होने वाला बैकड्रॉप।" />
                </span>
                <select className={styles.input} value={style} disabled={submitted}
                  onChange={(e) => setStyle(e.target.value)}>
                  {styleOptions.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
                {style === CUSTOM_OPTION && (
                  <input className={styles.input} style={{ marginTop: 8 }} maxLength={150} disabled={submitted}
                    placeholder="Describe the background you want…"
                    value={styleCustom} onChange={(e) => setStyleCustom(e.target.value)} />
                )}
              </label>
            )}

            {feature === 'ai_model' && (
              <>
                <label className={styles.field}>
                  <span>Jewellery type</span>
                  <select className={styles.input} value={category} disabled={submitted}
                    onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Collection <small>keeps one model across every piece</small></span>
                  <select className={styles.input} value={collectionId} disabled={submitted}
                    onChange={(e) => setCollectionId(e.target.value)}>
                    <option value="">No collection</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.model_reference_url ? ' · model locked' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {!collectionId && !submitted && (
                  <label className={styles.field}>
                    <span>…or start a new collection</span>
                    <input
                      className={styles.input}
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      placeholder="e.g. Diwali 2026"
                      maxLength={60}
                    />
                  </label>
                )}
              </>
            )}

            {/* Cost line — always visible before submit */}
            {!submitted && (
              <div className={styles.costBox}>
                <div className={styles.costRow}>
                  <Gem size={14} />
                  <span>
                    {pieces.length} piece{pieces.length === 1 ? '' : 's'} × 1 credit = <b>{cost} credit{cost === 1 ? '' : 's'}</b>
                  </span>
                </div>
                <span className={styles.costHave}>You have {credits}.</span>
                {shortBy > 0 && (
                  <button className={styles.buyLink} onClick={() => onNavigate?.('buy-credits')}>
                    {shortBy} short — buy credits
                  </button>
                )}
              </div>
            )}

            {error && <div className={styles.errorRow}><AlertCircle size={13} /><span>{error}</span></div>}

            {summary && (
              <div className={styles.summary}>
                {summary.succeeded} done{summary.failed > 0 ? `, ${summary.failed} failed` : ''}.
                {summary.refunded > 0 && ` ${summary.refunded} credit${summary.refunded === 1 ? '' : 's'} refunded — you're not charged for failures.`}
                {' '}They're saved to your Library too.
              </div>
            )}

            {!submitted ? (
              <button
                className={styles.goBtn}
                disabled={pieces.length === 0 || shortBy > 0 || running || !canUseSuite(store, 1)}
                onClick={submit}
              >
                {running
                  ? (<><Loader2 size={15} className={styles.spin} /> {uploading ? `Uploading ${uploading}` : 'Generating…'}</>)
                  : (<><Sparkles size={15} /> Generate {pieces.length || ''} piece{pieces.length === 1 ? '' : 's'}</>)}
              </button>
            ) : (
              <button className={styles.goBtn} disabled={running} onClick={resetAll}>
                <RotateCcw size={15} /> Start another batch
              </button>
            )}

            {running && (
              <p className={styles.runningNote}>
                You can leave this page — finished pieces are saved to your Library either way.
              </p>
            )}
          </div>
        </div>
      </div>

      {lightboxItem && (
        <div className={styles.lbOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lbContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lbClose} onClick={() => setLightbox(null)}><X size={18} /></button>
            <img src={lightboxItem.result_url} alt="" className={styles.lbImg} />
            <div className={styles.lbActions}>
              <button onClick={() => downloadOne(lightboxItem)}><Download size={15} /> Download</button>
              <button onClick={() => shareOne(lightboxItem)} disabled={sharing}><Share2 size={15} /> Share</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
