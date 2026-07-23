import React, { useCallback, useEffect, useState } from 'react';
import { CloudOff, Share2, Download, Store, ChevronRight, TrendingUp } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { fetchLatestRates, formatInr, formatRateDate } from '../../lib/rates';
import { renderRatePoster } from '../../lib/posterCanvas';
import { nativeShareMedia, downloadMedia } from '../../lib/share';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './GoldRatePoster.module.css';

/**
 * Daily Gold Rate poster. Reads today's IBJA rates (free, no credits) and
 * turns them into a branded, shareable poster rendered on a <canvas> — the
 * web equivalent of the mobile app's view-shot capture. This is the daily-
 * open habit hook: free, updates every day, carries the jeweller's branding
 * on every share.
 */
export default function GoldRatePoster({ onBack, onNavigate }) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(undefined); // undefined = loading, null = unavailable
  const [posterUrl, setPosterUrl] = useState(null);
  const [posterBlob, setPosterBlob] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [sharing, setSharing] = useState(false);

  const branding = {
    storeName: profile?.store_name ?? null,
    storePhone: profile?.store_phone ?? null,
    storeLogoUrl: profile?.store_logo_url ?? null,
  };
  const hasBranding = !!(branding.storeName || branding.storeLogoUrl);

  const load = useCallback(async () => {
    try {
      setData(await fetchLatestRates());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data) { setPosterUrl(null); setPosterBlob(null); return; }
    let active = true;
    setRendering(true);
    renderRatePoster({ ...data, branding, formatInr, formatRateDate })
      .then((blob) => {
        if (!active) return;
        setPosterBlob(blob);
        setPosterUrl(URL.createObjectURL(blob));
      })
      .finally(() => active && setRendering(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, branding.storeName, branding.storePhone, branding.storeLogoUrl]);

  const share = async () => {
    if (!posterUrl || sharing) return;
    setSharing(true);
    try {
      const file = new File([posterBlob], `todays-rate-${data.date}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Today's Rate" });
      } else {
        await downloadMedia(posterUrl, `todays-rate-${data.date}.jpg`);
        showToast('Poster downloaded — share it from your files.', '#1D4ED8');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Could not share the poster.', '#be123c');
    } finally {
      setSharing(false);
    }
  };

  const download = () => posterUrl && downloadMedia(posterUrl, `todays-rate-${data.date}.jpg`);

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={TrendingUp}
        title="Daily Gold Rate"
        sub="Rates sourced from IBJA (Indian Bullion and Jewellers Association) — share with your shop's name, free, one tap."
      />

      {data === undefined ? (
        <div className={styles.center}><div className="spinner" /></div>
      ) : data === null ? (
        <div className={styles.center}>
          <CloudOff size={30} />
          <p><strong>Rates unavailable</strong></p>
          <p>Today's rates haven't come in yet. Check back in a bit, or check your connection.</p>
          <button className={styles.retry} onClick={load}>Try again</button>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.previewWrap}>
            <div className={styles.poster}>
              {posterUrl ? (
                <img src={posterUrl} alt="Today's rate poster" className={styles.posterImg} />
              ) : (
                <div className={styles.center}><div className="spinner" /></div>
              )}
            </div>
          </div>

          <div className={styles.side}>
            {!hasBranding && (
              <button className={styles.nudge} onClick={() => onNavigate?.('store-branding')}>
                <Store size={18} />
                <span>Add your shop name & logo so the poster carries your brand.</span>
                <ChevronRight size={16} />
              </button>
            )}

            <span className={styles.freeNote}>Free · doesn't use any credits</span>
            <span className={styles.sourceNote}>Source: IBJA (ibjarates.com)</span>

            <button className={styles.shareBtn} onClick={share} disabled={rendering || sharing}>
              <Share2 size={16} /> {sharing ? 'Sharing…' : "Share today's rate"}
            </button>
            <button className={styles.secondaryBtn} onClick={download} disabled={rendering}>
              <Download size={15} /> Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
