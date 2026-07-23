import React, { useEffect, useRef, useState } from 'react';
import { PartyPopper, Share2, Download, Upload, Camera, Images, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { MAX_IMAGE_BYTES } from '../../lib/config';
import { FESTIVAL_THEMES } from '../../lib/festivalThemes';
import { renderFestivalPoster } from '../../lib/posterCanvas';
import { downloadMedia } from '../../lib/share';
import StudioLibraryPicker from '../../components/StudioLibraryPicker';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './FestivalPosters.module.css';

/**
 * Festival / occasion posters — Diwali, Dhanteras, wedding season, etc.
 * Same free canvas-rendered poster approach as the Daily Gold Rate poster,
 * with an editable greeting/subtext and the jeweller's store branding
 * stamped on the footer. No credits used — pure marketing collateral.
 *
 * Optionally, the jeweller can set their own photo (upload / camera / from
 * their Library) as the poster's background — the greeting text renders on
 * top of it with a dark scrim for legibility, replacing the flat theme
 * gradient for that render.
 */
export default function FestivalPosters({ onBack }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const [themeId, setThemeId] = useState(FESTIVAL_THEMES[0].id);
  const theme = FESTIVAL_THEMES.find((t) => t.id === themeId) ?? FESTIVAL_THEMES[0];

  const [greeting, setGreeting] = useState(theme.greeting);
  const [subtext, setSubtext] = useState(theme.subtext);
  const [textPosition, setTextPosition] = useState('middle'); // 'middle' | 'bottom'
  const [bgImageUrl, setBgImageUrl] = useState(null); // object URL or Library URL, used as poster backdrop
  const [posterUrl, setPosterUrl] = useState(null);
  const [posterBlob, setPosterBlob] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const branding = {
    storeName: profile?.store_name ?? null,
    storePhone: profile?.store_phone ?? null,
    storeLogoUrl: profile?.store_logo_url ?? null,
  };

  // Re-seed the editable text whenever the theme changes.
  useEffect(() => {
    setGreeting(theme.greeting);
    setSubtext(theme.subtext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId]);

  useEffect(() => {
    let active = true;
    setRendering(true);
    renderFestivalPoster({ theme, greeting, subtext, branding, backgroundImageUrl: bgImageUrl, textPosition })
      .then((blob) => {
        if (!active) return;
        setPosterBlob(blob);
        setPosterUrl(URL.createObjectURL(blob));
      })
      .finally(() => active && setRendering(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, greeting, subtext, bgImageUrl, textPosition, branding.storeName, branding.storePhone, branding.storeLogoUrl]);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`, '#be123c');
      return;
    }
    setBgImageUrl(URL.createObjectURL(file));
  };

  const pickFromLibrary = (url) => {
    setPickerOpen(false);
    setBgImageUrl(url);
  };

  const share = async () => {
    if (!posterUrl || sharing) return;
    setSharing(true);
    try {
      const file = new File([posterBlob], `${themeId}-poster.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: theme.label });
      } else {
        await downloadMedia(posterUrl, `${themeId}-poster.jpg`);
        showToast('Poster downloaded — share it from your files.', '#1D4ED8');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Could not share the poster.', '#be123c');
    } finally {
      setSharing(false);
    }
  };

  const download = () => posterUrl && downloadMedia(posterUrl, `${themeId}-poster.jpg`);

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={PartyPopper}
        title="Festival & occasion posters"
        sub="Diwali, Dhanteras, wedding season and more — branded, ready to share, free."
      />

      <div className={styles.layout}>
        <div className={styles.themeList}>
          {FESTIVAL_THEMES.map((t) => (
            <button
              key={t.id}
              className={`${styles.themeBtn} ${t.id === themeId ? styles.active : ''}`}
              onClick={() => setThemeId(t.id)}
            >
              <span className={styles.swatch} style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }} />
              {t.label}
            </button>
          ))}

          <div className={styles.bgSection}>
            <p className={styles.bgLabel}>Background photo</p>
            <p className={styles.bgHint}>Use your own photo instead of the theme colour — greeting text overlays on top.</p>
            <div className={styles.bgBtns}>
              <button className={styles.bgBtn} onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Upload
              </button>
              <button className={styles.bgBtn} onClick={() => camRef.current?.click()}>
                <Camera size={14} /> Camera
              </button>
              <button className={styles.bgBtn} onClick={() => setPickerOpen(true)}>
                <Images size={14} /> Library
              </button>
            </div>
            {bgImageUrl && (
              <button className={styles.bgRemove} onClick={() => setBgImageUrl(null)}>
                <X size={12} /> Remove photo, use theme colour
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>

        <div className={styles.previewWrap}>
          <div className={styles.poster}>
            {posterUrl ? (
              <img src={posterUrl} alt={theme.label} className={styles.posterImg} />
            ) : (
              <div className={styles.center}><div className="spinner" /></div>
            )}
          </div>
        </div>

        <div className={styles.side}>
          <div className={styles.field}>
            <label>Greeting</label>
            <input value={greeting} onChange={(e) => setGreeting(e.target.value)} maxLength={40} />
          </div>
          <div className={styles.field}>
            <label>Subtext</label>
            <input value={subtext} onChange={(e) => setSubtext(e.target.value)} maxLength={70} />
          </div>

          {bgImageUrl && (
            <div className={styles.field}>
              <label>Text position</label>
              <div className={styles.posToggle}>
                <button
                  className={`${styles.posBtn} ${textPosition === 'middle' ? styles.posBtnActive : ''}`}
                  onClick={() => setTextPosition('middle')}
                >
                  Middle
                </button>
                <button
                  className={`${styles.posBtn} ${textPosition === 'bottom' ? styles.posBtnActive : ''}`}
                  onClick={() => setTextPosition('bottom')}
                >
                  Bottom
                </button>
              </div>
              <p className={styles.posHint}>Move the greeting off the photo's center if it overlaps the jewellery or model.</p>
            </div>
          )}

          <span className={styles.freeNote}>Free · doesn't use any credits</span>

          <button className={styles.shareBtn} onClick={share} disabled={rendering || sharing}>
            <Share2 size={16} /> {sharing ? 'Sharing…' : 'Share poster'}
          </button>
          <button className={styles.secondaryBtn} onClick={download} disabled={rendering}>
            <Download size={15} /> Download
          </button>
        </div>
      </div>

      {pickerOpen && (
        <StudioLibraryPicker onClose={() => setPickerOpen(false)} onPick={pickFromLibrary} />
      )}
    </div>
  );
}
