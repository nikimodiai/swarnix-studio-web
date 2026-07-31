import React, { useCallback, useEffect, useState } from 'react';
import { Images, Trash2, X, Play, Share2, MessageCircle, Download, Link2, CheckSquare } from 'lucide-react';
import { db } from '../../lib/config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { reelPosterUrl } from '../../lib/reels';
import { nativeShareMedia, shareToWhatsApp, copyLink, downloadMedia } from '../../lib/share';
import { downloadUrlFor, hasCleanDownloads } from '../../lib/watermark';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './StudioLibrary.module.css';

// Filter tabs. 'reel' is special (reads reel_jobs); the rest map to app_gallery.kind.
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'studio_photo', label: 'Studio Photos' },
  { id: 'metal_swap', label: 'Metal Swaps' },
  { id: 'design', label: 'Designs' },
  { id: 'ai_model', label: 'AI Models' },
  { id: 'reel', label: 'Reels' },
];

export default function StudioLibrary({ onBack }) {
  const { store } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('all');
  const [images, setImages] = useState([]);  // app_gallery rows
  const [reels, setReels] = useState([]);     // completed reel_jobs
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // { type:'image'|'reel', url, poster? }
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]);    // [{ url, kind }]
  const [sharing, setSharing] = useState(false);
  // True once the account has spent a paid credit — every free-grade image is
  // then downloadable clean, so the "Watermarked" tags come off.
  const [unlocked, setUnlocked] = useState(false);

  const load = useCallback(async () => {
    if (!store?.owner_id) return;
    setLoading(true);
    try {
      const [imgRes, reelRes] = await Promise.allSettled([
        db.from('app_gallery')
          .select('id, image_url, title, kind, created_at, credit_grade')
          .eq('user_id', store.owner_id)
          .order('created_at', { ascending: false }),
        db.from('reel_jobs')
          .select('id, output_url, length_seconds, created_at')
          .eq('user_id', store.owner_id)
          .eq('status', 'completed')
          .not('output_url', 'is', null)
          .order('created_at', { ascending: false }),
      ]);
      setImages(imgRes.status === 'fulfilled' ? (imgRes.value.data || []) : []);
      setReels(reelRes.status === 'fulfilled' ? (reelRes.value.data || []) : []);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    hasCleanDownloads().then((ok) => { if (active) setUnlocked(ok); });
    return () => { active = false; };
  }, []);

  const deleteImage = async (id) => {
    try {
      await db.from('app_gallery').delete().eq('id', id).eq('user_id', store.owner_id);
      setImages((prev) => prev.filter((r) => r.id !== id));
      showToast('Removed from library.', '#be123c');
    } catch (e) {
      showToast('Could not delete: ' + (e.message || 'unknown'), '#be123c');
    }
  };

  const showImages = tab === 'all' || tab !== 'reel';
  const showReels = tab === 'all' || tab === 'reel';
  const filteredImages = tab === 'all' || tab === 'reel' ? images : images.filter((r) => r.kind === tab);

  // ── Clean-download unlock ──
  // Free-credit output is stored watermarked. Once the account has spent a paid
  // credit, app_clean_public_id() starts returning the clean image for those
  // rows — so buying retroactively unlocks everything made on free credits.
  // We resolve lazily (only when the user actually shares/downloads/copies)
  // rather than upfront, to avoid an RPC per thumbnail on every library load.
  const resolveUrl = useCallback(async (url, id) => {
    if (!id) return url;                        // reels: never watermarked
    const item = images.find((r) => r.id === id);
    if (!item || item.credit_grade !== 'free') return url;
    return (await downloadUrlFor(item)) || url;
  }, [images]);

  // ── Selection + sharing ──
  const isSelected = (url) => selected.some((s) => s.url === url);
  const toggleSelect = (url, id) => setSelected((prev) =>
    prev.some((s) => s.url === url) ? prev.filter((s) => s.url !== url) : [...prev, { url, id }]);
  const exitSelect = () => { setSelectMode(false); setSelected([]); };

  // Share a single item: native sheet (real file on mobile) with graceful
  // fallback to WhatsApp link on desktop.
  const shareOne = async (url, name, id) => {
    setSharing(true);
    try {
      const real = await resolveUrl(url, id);
      const res = await nativeShareMedia([{ url: real, name }], { title: 'Swarnix', text: '' });
      if (res === 'unsupported') { shareToWhatsApp(real); }
    } finally { setSharing(false); }
  };

  const shareSelected = async () => {
    if (selected.length === 0) return;
    setSharing(true);
    try {
      const urls = await Promise.all(selected.map((s) => resolveUrl(s.url, s.id)));
      const res = await nativeShareMedia(urls.map((url) => ({ url })), { title: 'Swarnix' });
      if (res === 'unsupported') shareToWhatsApp(urls);   // link fallback
      if (res !== 'cancelled') exitSelect();
    } finally { setSharing(false); }
  };

  const doCopy = async (url, id) => {
    const ok = await copyLink(await resolveUrl(url, id));
    showToast(ok ? 'Link copied.' : 'Could not copy link.', ok ? '#166534' : '#be123c');
  };

  const isEmpty = !loading
    && (!showImages || filteredImages.length === 0)
    && (!showReels || reels.length === 0);

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={Images} title="Library"
        sub="Every photo and video you’ve generated with AI Studio Suite."
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {!loading && !isEmpty && (
          selectMode ? (
            <div className={styles.toolbarActions}>
              <span className={styles.shareCount}>{selected.length} selected</span>
              <button className={styles.shareBtn} disabled={selected.length === 0 || sharing} onClick={shareSelected}>
                {sharing ? <div className="spinner spinner-sm" /> : <Share2 size={15} />}
                Share {selected.length || ''} to WhatsApp
              </button>
              <button className={styles.selectToggle} onClick={exitSelect}><X size={14} /> Cancel</button>
            </div>
          ) : (
            <button className={styles.selectToggle} onClick={() => setSelectMode(true)}><CheckSquare size={14} /> Select</button>
          )
        )}
      </div>

      {loading ? (
        <div className={styles.center}><div className="spinner" /></div>
      ) : isEmpty ? (
        <div className={hub.lock}>
          <Images size={28} strokeWidth={1.4} />
          <h2>Nothing here yet</h2>
          <p>Generate a photo or reel from AI Studio Suite and it’ll show up here.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {/* Reels first when relevant */}
          {showReels && reels.map((r) => {
            const poster = reelPosterUrl(r.output_url);
            const sel = isSelected(r.output_url);
            return (
              <div
                key={`reel-${r.id}`}
                className={`${styles.cell} ${sel ? styles.cellSel : ''}`}
                onClick={() => selectMode ? toggleSelect(r.output_url) : setLightbox({ type: 'reel', url: r.output_url, poster })}
              >
                {poster ? <img src={poster} alt="reel" className={styles.cellImg} /> : <div className={styles.cellImg} />}
                <span className={styles.playBadge}><Play size={14} fill="#fff" /></span>
                <span className={styles.kindTag}>{r.length_seconds ? `${r.length_seconds}s reel` : 'Reel'}</span>
                {selectMode && <span className={`${styles.selDot} ${sel ? styles.selDotOn : ''}`}>{sel ? '✓' : ''}</span>}
              </div>
            );
          })}
          {showImages && filteredImages.map((im) => {
            const sel = isSelected(im.image_url);
            return (
              <div
                key={im.id}
                className={`${styles.cell} ${sel ? styles.cellSel : ''}`}
                onClick={() => selectMode ? toggleSelect(im.image_url, im.id) : setLightbox({ type: 'image', url: im.image_url, id: im.id })}
              >
                <img src={im.image_url} alt={im.title || 'image'} className={styles.cellImg} />
                {im.kind && <span className={styles.kindTag}>{TABS.find((t) => t.id === im.kind)?.label || im.kind}</span>}
                {im.credit_grade === 'free' && !unlocked && (
                  <span className={styles.freeTag} title="Made with a free credit — buy any pack to unlock the clean version">
                    Watermarked
                  </span>
                )}
                {selectMode
                  ? <span className={`${styles.selDot} ${sel ? styles.selDotOn : ''}`}>{sel ? '✓' : ''}</span>
                  : <button className={styles.delBtn} onClick={(e) => { e.stopPropagation(); deleteImage(im.id); }} title="Delete"><Trash2 size={13} /></button>}
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div className={styles.lbOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lbContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lbClose} onClick={() => setLightbox(null)}><X size={18} /></button>
            {lightbox.type === 'reel'
              ? <video className={styles.lbMedia} src={lightbox.url} poster={lightbox.poster || undefined} controls autoPlay playsInline />
              : <img className={styles.lbMedia} src={lightbox.url} alt="full" />}

            <div className={styles.lbShare}>
              <button className={styles.lbShareBtn} disabled={sharing}
                onClick={() => shareOne(lightbox.url, lightbox.type === 'reel' ? 'swarnix-reel.mp4' : 'swarnix.jpg', lightbox.id)}>
                <Share2 size={16} /> Share
              </button>
              <button className={`${styles.lbShareBtn} ${styles.waBtn}`}
                onClick={async () => shareToWhatsApp(await resolveUrl(lightbox.url, lightbox.id))}>
                <MessageCircle size={16} /> WhatsApp
              </button>
              <button className={styles.lbShareBtn} onClick={() => doCopy(lightbox.url, lightbox.id)}>
                <Link2 size={16} /> Copy link
              </button>
              <button className={styles.lbShareBtn}
                onClick={async () => downloadMedia(
                  await resolveUrl(lightbox.url, lightbox.id),
                  lightbox.type === 'reel' ? 'swarnix-reel.mp4' : 'swarnix.jpg'
                )}>
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
