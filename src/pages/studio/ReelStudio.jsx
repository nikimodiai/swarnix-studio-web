import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Upload, X, Sparkles, AlertCircle, ArrowLeft, CheckCircle2, Loader2, Images, Camera, Play, Pause, Music, Wand2, Clapperboard, RefreshCw } from 'lucide-react';
import { db, MAX_IMAGE_BYTES } from '../../lib/config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { hasFeature, reelSuiteCost } from '../../lib/plans';
import { suiteUnitsLeft } from '../../lib/studioSuite';
import { reserveCredits, refundCredits } from '../../lib/credits';
import {
  RATIOS, QUALITIES, DEFAULT_RATIO, DEFAULT_RESOLUTION,
  LENGTH_MIN, LENGTH_MAX, LENGTH_DEFAULT, MAX_REEL_IMAGES,
  endOverlayDuration, uploadReelImage, submitReel, fetchReel, subscribeToReel, reelPosterUrl,
  fetchReelMusic, uploadReelMusic, MAX_MUSIC_BYTES,
  OVERLAY_FONTS, DEFAULT_OVERLAY_FONT, OVERLAY_COLORS, DEFAULT_OVERLAY_COLOR,
  analyzeStoryboard, submitStoryboardReel,
} from '../../lib/reels';
import { SuiteFeatureHeader } from '../StudioSuite';
import StudioLibraryPicker from '../../components/StudioLibraryPicker';
import hub from '../StudioSuite.module.css';
import styles from './ReelStudio.module.css';

// How many scenes a storyboard reel of `length` seconds produces — mirrors the
// n8n "Storyboard Setup" rule (each scene ≥ 4s, capped at 6). Used to price the
// per-scene AI first-frame surcharge before the script is even generated.
function expectedSceneCount(length) {
  const byLength = length < 8 ? 1 : length <= 12 ? 2 : 3;
  const maxByMin = Math.max(1, Math.floor(length / 4));
  return Math.min(Math.max(byLength, 1), maxByMin, 6);
}

export default function ReelStudio({ onBack }) {
  const { store, refreshStore } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState('create');   // 'create' | 'storyboard' | 'result'
  const [mode, setMode] = useState('storyboard'); // 'classic' (multi-image) | 'storyboard' (1 photo → AI script)
  const [images, setImages] = useState([]);      // [{ file, preview }]
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [length, setLength] = useState(LENGTH_DEFAULT);
  const [musicId, setMusicId] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [customMusic, setCustomMusic] = useState(null);   // { name, url } | null
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [previewId, setPreviewId] = useState(null);       // which track is playing a preview
  const [overlayText, setOverlayText] = useState('');
  const [overlayPosition, setOverlayPosition] = useState('end');
  const [overlayFont, setOverlayFont] = useState(DEFAULT_OVERLAY_FONT);
  const [overlayColor, setOverlayColor] = useState(DEFAULT_OVERLAY_COLOR);
  const [customPrompt, setCustomPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [job, setJob] = useState(null);          // active reel_jobs row

  // Storyboard mode state.
  const [analyzing, setAnalyzing] = useState(false);
  const [storyboardImageUrl, setStoryboardImageUrl] = useState(null); // hosted URL of the single photo
  const [scenes, setScenes] = useState([]);      // [{ order, title, duration, prompt, caption }]
  const [analysis, setAnalysis] = useState('');
  const [styleName, setStyleName] = useState('');

  const [libOpen, setLibOpen] = useState(false);
  const chargedRef = useRef(false);              // guard: charge once per job
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const musicFileRef = useRef(null);
  const audioRef = useRef(null);                 // single shared <audio> for previews

  const featureOn = hasFeature(store, 'ai_studio_suite');
  const unitsLeft = suiteUnitsLeft(store);
  // Storyboard reels generate a bespoke AI first-frame PER scene (extra image-gen
  // cost each), so they cost +1 credit per scene over classic. Once the script is
  // loaded we price the actual scene count; before that we estimate from length.
  const sceneSurcharge = mode === 'storyboard' ? (scenes.length || expectedSceneCount(length)) : 0;
  const cost = useMemo(
    () => reelSuiteCost(length, resolution) + sceneSurcharge,
    [length, resolution, sceneSurcharge],
  );
  const enough = unitsLeft >= cost;
  // Storyboard reels use ONE photo; classic reels accept up to MAX_REEL_IMAGES.
  const maxImages = mode === 'storyboard' ? 1 : MAX_REEL_IMAGES;
  const canGenerate = featureOn && images.length > 0 && !submitting && enough;
  const canAnalyze = featureOn && images.length > 0 && !analyzing && !submitting;

  // Load music once (failure → no music option).
  useEffect(() => {
    let active = true;
    fetchReelMusic().then((t) => active && setTracks(t));
    return () => { active = false; };
  }, []);

  // Stop any preview when leaving the create view or unmounting.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Play / pause a track's preview_url through one shared <audio> element.
  const togglePreview = (track) => {
    const el = audioRef.current;
    if (!el || !track?.previewUrl) return;
    if (previewId === track.musicId) {
      el.pause();
      setPreviewId(null);
      return;
    }
    el.src = track.previewUrl;
    el.play().then(() => setPreviewId(track.musicId)).catch(() => setPreviewId(null));
  };

  const pickMusicUpload = async (fileList) => {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { setError('Please choose an audio file (mp3, m4a, wav).'); return; }
    if (file.size > MAX_MUSIC_BYTES) { setError('Music file is over 10 MB. Please pick a shorter track.'); return; }
    setUploadingMusic(true);
    setError(null);
    try {
      const url = await uploadReelMusic(file);
      setCustomMusic({ name: file.name, url });
      setMusicId(null);            // custom upload supersedes a library pick
      audioRef.current?.pause();
      setPreviewId(null);
    } catch (e) {
      setError(e.message || 'Could not upload that music file.');
    } finally {
      setUploadingMusic(false);
      if (musicFileRef.current) musicFileRef.current.value = '';
    }
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const room = maxImages - images.length;
    const next = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_IMAGE_BYTES) { setError(`One image is over 5 MB and was skipped.`); continue; }
      if (!f.type.startsWith('image/')) continue;
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    if (next.length) { setError(null); setImages((prev) => [...prev, ...next].slice(0, maxImages)); }
  };
  // Add already-hosted images picked from the Studio Library (no upload needed).
  const addFromLibrary = (urls) => {
    setLibOpen(false);
    const room = maxImages - images.length;
    const next = urls.slice(0, room).map((url) => ({ url, preview: url }));
    if (next.length) { setError(null); setImages((prev) => [...prev, ...next].slice(0, maxImages)); }
  };
  const removeImage = (i) => setImages((prev) => {
    const copy = [...prev];
    const [gone] = copy.splice(i, 1);
    // Only blob previews (device files) need revoking; library previews are URLs.
    if (gone?.file && gone?.preview) URL.revokeObjectURL(gone.preview);
    return copy;
  });
  useEffect(() => () => { images.forEach((im) => im.file && im.preview && URL.revokeObjectURL(im.preview)); }, []); // eslint-disable-line

  // Reels are billed by RESERVE-ON-SUBMIT (see below). n8n's server-side trigger
  // refunds a failed reel, so here we only track status for the UI.
  const onJobChange = useCallback(async (next) => {
    setJob(next);
    // Storyboard reels are charged on completion (and classic reels are refunded
    // on failure) server-side — refresh either way so the header balance is live.
    if (next.status === 'completed' || next.status === 'failed') await refreshStore();
  }, [refreshStore]);

  const generate = async () => {
    if (!canGenerate) return;
    setSubmitting(true);
    setError(null);
    chargedRef.current = false;

    // Reserve the reel's cost up front (free allowance first, then paid) so a
    // user can't queue reels they can't pay for. Refund if submit fails before a
    // reel_jobs row exists; once a row exists, n8n's trg_reel_refund_on_fail
    // handles refunds server-side if the render later fails.
    let reservation = null;
    try {
      reservation = await reserveCredits(cost);
    } catch {
      setSubmitting(false);
      setError('Could not check your credits. Please try again.');
      return;
    }
    if (!reservation.ok) {
      setSubmitting(false);
      setError('Not enough credits for this reel. Buy more or reduce length/quality.');
      return;
    }
    await refreshStore();

    try {
      // Resolve every image to a public URL in scene order. Library picks are
      // already hosted; device files are uploaded to Cloudinary.
      const urls = [];
      for (const im of images) {
        urls.push(im.url || await uploadReelImage(im.file, `reel_${store.owner_id}_${Date.now()}.jpg`));
      }
      const jobId = await submitReel({
        userId: store.owner_id,
        imageUrls: urls,
        lengthSeconds: length,
        ratio,
        resolution,
        customPrompt,
        musicId,
        musicUrl: customMusic?.url || null,
        overlayText,
        overlayPosition,
        overlayFont,
        overlayColor,
      });
      // Seed a processing job row locally, switch to the result view, and watch.
      setJob({ id: jobId, status: 'processing', outputUrl: null, lengthSeconds: length, resolution });
      setView('result');
      const initial = await fetchReel(jobId);
      if (initial) await onJobChange(initial);
    } catch (e) {
      // Submit failed before any reel_jobs row was created — refund the reserve
      // ourselves (the server trigger only fires on a row transition to failed).
      try { await refundCredits(reservation.fromFree, reservation.fromPaid); } catch { /* best-effort */ }
      await refreshStore();
      setError(e.message || 'Couldn’t create your reel. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Resolve the single storyboard photo to a hosted URL (library picks already
  // are; device files upload once here and are reused at generate time).
  const resolveStoryboardImage = async () => {
    const im = images[0];
    if (!im) throw new Error('Add a photo first.');
    if (im.url) return im.url;
    return uploadReelImage(im.file, `reel_${store.owner_id}_${Date.now()}.jpg`);
  };

  // Storyboard step 1: analyse the photo and get an editable script. Free — no
  // credits are reserved until the user actually generates the reel.
  const analyze = async () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setError(null);
    try {
      const url = await resolveStoryboardImage();
      setStoryboardImageUrl(url);
      const plan = await analyzeStoryboard({ imageUrl: url, lengthSeconds: length, ratio, resolution });
      setScenes(plan.scenes);
      setAnalysis(plan.analysis);
      setStyleName(plan.styleName);
      setView('storyboard');
    } catch (e) {
      setError(e.message || 'Couldn’t analyse that photo. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateScene = (i, field, value) =>
    setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));

  // Storyboard step 2: submit the edited scenes. Credits are NOT reserved up
  // front — the reel is charged server-side ONLY when it completes (Supabase
  // trg_reel_charge_on_complete). So a failed reel is never debited, and there's
  // no refund to chase. We only gate on the current balance before submitting.
  const generateStoryboard = async () => {
    const valid = scenes.filter((s) => (s.prompt || '').trim());
    if (!featureOn || !enough || submitting || !storyboardImageUrl || !valid.length) return;
    setSubmitting(true);
    setError(null);

    try {
      const jobId = await submitStoryboardReel({
        userId: store.owner_id,
        imageUrl: storyboardImageUrl,
        scenes: valid,
        lengthSeconds: length,
        ratio,
        resolution,
        styleName,
        customPrompt,
        musicId,
        musicUrl: customMusic?.url || null,
        overlayText,
        overlayPosition,
        overlayFont,
        overlayColor,
      });
      setJob({ id: jobId, status: 'processing', outputUrl: null, lengthSeconds: length, resolution });
      setView('result');
      const initial = await fetchReel(jobId);
      if (initial) await onJobChange(initial);
    } catch (e) {
      // Nothing was charged, so there's nothing to refund — just surface the error.
      setError(e.message || 'Couldn’t create your reel. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Subscribe to the active job while on the result view.
  useEffect(() => {
    if (view !== 'result' || !job?.id) return;
    const unsub = subscribeToReel(job.id, (next) => { onJobChange(next); });
    return unsub;
  }, [view, job?.id, onJobChange]);

  const startNew = () => {
    images.forEach((im) => im.file && im.preview && URL.revokeObjectURL(im.preview));
    audioRef.current?.pause();
    setImages([]); setJob(null); setError(null); setView('create');
    setOverlayText(''); setCustomPrompt('');
    setMusicId(null); setCustomMusic(null); setPreviewId(null);
    setScenes([]); setStoryboardImageUrl(null); setAnalysis(''); setStyleName('');
    chargedRef.current = false;
  };

  // Switching mode resets the picked photos (storyboard allows only one) and any
  // in-progress script, so the two flows never bleed into each other.
  const switchMode = (next) => {
    if (next === mode) return;
    images.forEach((im) => im.file && im.preview && URL.revokeObjectURL(im.preview));
    setMode(next);
    setImages([]); setScenes([]); setStoryboardImageUrl(null);
    setAnalysis(''); setStyleName(''); setError(null);
  };

  const lengthHint = length < 8 ? 'Single-scene reel' : length <= 12 ? 'Two-scene reel' : 'Three-scene reel';

  // ── Storyboard view (edit the AI-written script before generating) ──
  if (view === 'storyboard') {
    const validScenes = scenes.filter((s) => (s.prompt || '').trim()).length;
    const canMakeReel = featureOn && enough && !submitting && validScenes > 0;
    return (
      <div className={hub.page}>
        <SuiteFeatureHeader
          onBack={onBack} icon={Clapperboard} title="Your reel storyboard"
          sub="Edit each scene’s script, then generate. Every scene becomes a clip from your one photo."
          right={unitsLeft !== Infinity ? <span className={styles.usage}>{unitsLeft} Studio credits left</span> : null}
        />
        <button className={styles.linkBtn} onClick={() => setView('create')}><ArrowLeft size={14} /> Back to photo</button>

        <div className={`${styles.form} ${styles.formWide}`}>
          {(analysis || styleName) && (
            <div className={styles.sbSummary}>
              {analysis && <p className={styles.sbAnalysis}>{analysis}</p>}
              {styleName && <span className={styles.sbStyleBadge}><Sparkles size={12} /> {styleName}</span>}
            </div>
          )}

          <div className={styles.sceneList}>
            {scenes.map((s, i) => (
              <div key={i} className={styles.sceneCard}>
                <div className={styles.sceneHead}>
                  <span className={styles.sceneNum}>Scene {i + 1}</span>
                  <span className={styles.sceneTitle}>{s.title}</span>
                  {s.duration ? <span className={styles.sceneDur}>{s.duration}s</span> : null}
                </div>
                <textarea
                  className={styles.textarea}
                  value={s.prompt}
                  maxLength={600}
                  placeholder="Describe the shot — camera move, lighting, mood…"
                  onChange={(e) => updateScene(i, 'prompt', e.target.value)}
                />
                <input
                  className={styles.input}
                  style={{ marginTop: 8 }}
                  value={s.caption}
                  maxLength={60}
                  placeholder="On-screen caption for this scene (optional)"
                  onChange={(e) => updateScene(i, 'caption', e.target.value)}
                />
              </div>
            ))}
          </div>

          {error && <div className={styles.errorRow}><AlertCircle size={13} /><span>{error}</span></div>}

          <div className={styles.costRow}>
            <span>Cost: <b className={styles.costVal}>{cost} Studio credit{cost === 1 ? '' : 's'}</b></span>
            {unitsLeft !== Infinity && (
              <span className={enough ? styles.muted : styles.danger}>{unitsLeft} left</span>
            )}
          </div>

          <div className={styles.sbActions}>
            <button className={styles.secondaryBtn} onClick={analyze} disabled={analyzing || submitting}>
              {analyzing ? (<><div className="spinner spinner-sm" /> Rewriting…</>) : (<><RefreshCw size={14} /> Regenerate script</>)}
            </button>
            <button className={styles.generateBtn} onClick={generateStoryboard} disabled={!canMakeReel}>
              {submitting ? (<><div className="spinner spinner-sm" /> Submitting…</>) : (<><Film size={15} /> Generate Reel · {cost} credit{cost === 1 ? '' : 's'}</>)}
            </button>
          </div>
          {!enough && (
            <p className={styles.danger} style={{ textAlign: 'center', marginTop: 8 }}>
              Not enough Studio credits left — reduce length or quality on the previous screen.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Result / progress view ──
  if (view === 'result') {
    const poster = reelPosterUrl(job?.outputUrl);
    return (
      <div className={hub.page}>
        <SuiteFeatureHeader onBack={onBack} icon={Film} title="Generate Reels" sub="Your reel is rendering — this usually takes 1–4 minutes." />
        <button className={styles.linkBtn} onClick={startNew}><ArrowLeft size={14} /> Make another reel</button>

        <div className={styles.resultCard}>
          {job?.status === 'completed' && job.outputUrl ? (
            <>
              <video className={styles.video} src={job.outputUrl} poster={poster || undefined} controls playsInline />
              <div className={styles.resultMeta}>
                <span className={styles.doneBadge}><CheckCircle2 size={15} /> Ready</span>
                <a className={styles.dlBtn} href={job.outputUrl} target="_blank" rel="noreferrer">Open / Download</a>
              </div>
            </>
          ) : job?.status === 'failed' ? (
            <div className={styles.progressBox}>
              <AlertCircle size={26} color="#be123c" />
              <b>Reel failed to render</b>
              <span>{job.errorMessage || 'Something went wrong. You were not charged — please try again.'}</span>
            </div>
          ) : (
            <div className={styles.progressBox}>
              <Loader2 size={26} className={styles.spin} />
              <b>Creating your reel…</b>
              <span>You can leave this screen — it’ll be in your Library when it’s done.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Create view ──
  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={Film} title="Generate Reels"
        sub="Turn your photos into a short, shareable video — with AI motion and music."
        right={unitsLeft !== Infinity ? <span className={styles.usage}>{unitsLeft} Studio credits left</span> : null}
      />

      {!featureOn ? (
        <div className={hub.lock}>
          <Sparkles size={28} strokeWidth={1.4} />
          <h2>Reels aren’t available on your plan</h2>
          <p>Upgrade your plan to use AI Studio Suite.</p>
        </div>
      ) : (
        <div className={styles.form}>
          {/* Mode toggle */}
          <div className={styles.section}>
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${mode === 'storyboard' ? styles.modeActive : ''}`}
                onClick={() => switchMode('storyboard')}
              >
                <Wand2 size={16} />
                <b>Storyboard</b>
                <small>Upload one photo and AI writes a multi-scene reel — a fresh cinematic shot for every scene. Best for a polished, ad-style video.</small>
              </button>
              <button
                className={`${styles.modeBtn} ${mode === 'classic' ? styles.modeActive : ''}`}
                onClick={() => switchMode('classic')}
              >
                <Images size={16} />
                <b>Classic</b>
                <small>Upload your own photos and we animate them in the order you choose. Best when you already have the shots you want.</small>
              </button>
            </div>
          </div>

          {/* Images */}
          <div className={styles.section}>
            <label className={styles.label}>
              {mode === 'storyboard' ? 'Photo' : 'Images'}{' '}
              <span className={styles.muted}>
                {mode === 'storyboard' ? '· one photo — AI turns it into multiple scenes' : `· up to ${MAX_REEL_IMAGES}, in scene order`}
              </span>
            </label>
            <div className={styles.imgGrid}>
              {images.map((im, i) => (
                <div key={i} className={styles.imgSlot}>
                  <img src={im.preview} alt={`scene ${i + 1}`} />
                  <button className={styles.imgRemove} onClick={() => removeImage(i)}><X size={11} /></button>
                  {mode === 'classic' && <span className={styles.imgIdx}>{i + 1}</span>}
                </div>
              ))}
              {images.length < maxImages && (
                <>
                  <button className={styles.addSlot} onClick={() => fileRef.current?.click()}>
                    <Upload size={18} /><small>Upload</small>
                  </button>
                  <button className={styles.addSlot} onClick={() => camRef.current?.click()}>
                    <Camera size={18} /><small>Camera</small>
                  </button>
                  <button className={styles.addSlot} onClick={() => setLibOpen(true)}>
                    <Images size={18} /><small>Library</small>
                  </button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)} />
            </div>
            {images.length === 0 && (
              <p className={styles.hint}>
                {mode === 'storyboard'
                  ? 'Add one photo — upload, camera, or your Studio Library. AI will write a multi-scene reel from it.'
                  : 'Add at least one image — upload, camera, or your Studio Library. The reel flows through them in order.'}
              </p>
            )}
          </div>

          {/* Format */}
          <div className={styles.section}>
            <label className={styles.label}>Format</label>
            <div className={styles.fmtCards}>
              {RATIOS.map((r) => (
                <button key={r.value} className={`${styles.fmtCard} ${ratio === r.value ? styles.fmtActive : ''}`} onClick={() => setRatio(r.value)}>
                  <b>{r.label}</b><small>{r.hint}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Length slider */}
          <div className={styles.section}>
            <div className={styles.rowBetween}>
              <label className={styles.label}>Length</label>
              <span className={styles.lengthVal}>{length}s</span>
            </div>
            <input type="range" className={styles.slider} min={LENGTH_MIN} max={LENGTH_MAX} step={1}
              value={length} onChange={(e) => setLength(Number(e.target.value))} />
            <div className={styles.rowBetween}>
              <small className={styles.muted}>{LENGTH_MIN}s</small>
              <small className={styles.muted}>{lengthHint}</small>
              <small className={styles.muted}>{LENGTH_MAX}s</small>
            </div>
          </div>

          {/* Quality */}
          <div className={styles.section}>
            <label className={styles.label}>Quality</label>
            <div className={styles.segment}>
              {QUALITIES.map((q) => (
                <button key={q.value} className={`${styles.segItem} ${resolution === q.value ? styles.segActive : ''}`} onClick={() => setResolution(q.value)}>
                  <b>{q.label}</b><small>{q.hint}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Music */}
          <div className={styles.section}>
            <label className={styles.label}>Music <span className={styles.muted}>· optional</span></label>
            {/* Shared hidden audio element for previews */}
            <audio ref={audioRef} onEnded={() => setPreviewId(null)} style={{ display: 'none' }} />

            <div className={styles.musicList}>
              <button
                className={`${styles.musicRow} ${musicId === null && !customMusic ? styles.musicActive : ''}`}
                onClick={() => { setMusicId(null); setCustomMusic(null); audioRef.current?.pause(); setPreviewId(null); }}
              >
                <span className={styles.musicName}>No music</span>
              </button>

              {tracks.map((t) => (
                <div
                  key={t.musicId}
                  className={`${styles.musicRow} ${musicId === t.musicId ? styles.musicActive : ''}`}
                  onClick={() => { setMusicId(t.musicId); setCustomMusic(null); }}
                  role="button"
                  tabIndex={0}
                >
                  {t.previewUrl && (
                    <button
                      type="button"
                      className={styles.previewBtn}
                      onClick={(e) => { e.stopPropagation(); togglePreview(t); }}
                      aria-label={previewId === t.musicId ? 'Pause preview' : 'Play preview'}
                    >
                      {previewId === t.musicId ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  )}
                  <span className={styles.musicName}>{t.name}</span>
                  {t.mood && <span className={styles.musicMood}>{t.mood}</span>}
                </div>
              ))}

              {/* Custom uploaded track */}
              {customMusic && (
                <div className={`${styles.musicRow} ${styles.musicActive}`}>
                  <Music size={14} className={styles.musicIcon} />
                  <span className={styles.musicName} title={customMusic.name}>{customMusic.name}</span>
                  <button
                    type="button"
                    className={styles.musicRemove}
                    onClick={(e) => { e.stopPropagation(); setCustomMusic(null); }}
                    aria-label="Remove uploaded music"
                  ><X size={13} /></button>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.uploadMusicBtn}
              onClick={() => musicFileRef.current?.click()}
              disabled={uploadingMusic}
            >
              {uploadingMusic ? <><div className="spinner spinner-sm" /> Uploading…</> : <><Upload size={13} /> Upload your own music</>}
            </button>
            <input ref={musicFileRef} type="file" accept="audio/*" style={{ display: 'none' }}
              onChange={(e) => pickMusicUpload(e.target.files)} />
            <p className={styles.hint}>Use music you own or have a licence for. Uploaded tracks are trimmed to your reel length.</p>
          </div>

          {/* Contact overlay */}
          <div className={styles.section}>
            <label className={styles.label}>Contact text <span className={styles.muted}>· optional</span></label>
            <input className={styles.input} maxLength={80} placeholder="e.g. Contact XYZ Jewellers · 98765 43210"
              value={overlayText} onChange={(e) => setOverlayText(e.target.value)} />
            {overlayText.trim() && (
              <>
                {/* Live preview of how the burned-in text will look */}
                <div className={styles.overlayPreview}>
                  <span
                    className={styles.overlayPreviewText}
                    style={{
                      fontFamily: OVERLAY_FONTS.find((f) => f.value === overlayFont)?.css,
                      color: OVERLAY_COLORS.find((c) => c.value === overlayColor)?.css,
                    }}
                  >
                    {overlayText.trim()}
                  </span>
                </div>

                <div className={styles.rowBetween} style={{ gap: 12, marginTop: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label className={styles.miniLabel}>Font</label>
                    <div className={styles.chips}>
                      {OVERLAY_FONTS.map((f) => (
                        <button key={f.value} className={`${styles.chip} ${overlayFont === f.value ? styles.chipActive : ''}`}
                          style={{ fontFamily: f.css }} onClick={() => setOverlayFont(f.value)}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <label className={styles.miniLabel}>Colour</label>
                    <div className={styles.swatchRow}>
                      {OVERLAY_COLORS.map((c) => (
                        <button
                          key={c.value}
                          className={`${styles.swatch} ${overlayColor === c.value ? styles.swatchActive : ''}`}
                          style={{ background: c.css }}
                          onClick={() => setOverlayColor(c.value)}
                          aria-label={c.label}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.segment} style={{ marginTop: 12 }}>
                  {['end', 'whole'].map((pos) => (
                    <button key={pos} className={`${styles.segItem} ${overlayPosition === pos ? styles.segActive : ''}`} onClick={() => setOverlayPosition(pos)}>
                      <b>{pos === 'end' ? 'At the end' : 'Whole reel'}</b>
                      <small>{pos === 'end' ? `Last ${endOverlayDuration(length)}s` : 'Always visible'}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Prompt */}
          <div className={styles.section}>
            <label className={styles.label}>Anything to add? <span className={styles.muted}>· optional</span></label>
            <textarea className={styles.textarea} maxLength={300} placeholder="e.g. focus on the diamond, slow elegant motion…"
              value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} />
          </div>

          {error && <div className={styles.errorRow}><AlertCircle size={13} /><span>{error}</span></div>}

          {mode === 'storyboard' ? (
            <>
              <button className={styles.generateBtn} onClick={analyze} disabled={!canAnalyze}>
                {analyzing ? (<><div className="spinner spinner-sm" /> Analysing your photo…</>) : (<><Wand2 size={15} /> Analyse &amp; write script</>)}
              </button>
              <p className={styles.hint} style={{ textAlign: 'center' }}>
                Free — you’ll review and edit the scenes before any credits are used.
              </p>
            </>
          ) : (
            <>
              {/* Cost + generate */}
              <div className={styles.costRow}>
                <span>Cost: <b className={styles.costVal}>{cost} Studio credit{cost === 1 ? '' : 's'}</b></span>
                {unitsLeft !== Infinity && (
                  <span className={enough ? styles.muted : styles.danger}>{unitsLeft} left</span>
                )}
              </div>
              <button className={styles.generateBtn} onClick={generate} disabled={!canGenerate}>
                {submitting ? (<><div className="spinner spinner-sm" /> Submitting…</>) : (<><Film size={15} /> Generate Reel · {cost} Studio credit{cost === 1 ? '' : 's'}</>)}
              </button>
              {images.length > 0 && !enough && (
                <p className={styles.danger} style={{ textAlign: 'center', marginTop: 8 }}>
                  Not enough Studio credits left for this reel — reduce length or quality.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {libOpen && (
        <StudioLibraryPicker multi onClose={() => setLibOpen(false)} onPickMany={addFromLibrary} />
      )}
    </div>
  );
}
