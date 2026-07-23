import React, { useState } from 'react';
import { Camera, Repeat, Gem, Sparkles, Film } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './Login.module.css';

const PERKS = [
  { icon: Camera, label: 'Studio Photos' },
  { icon: Repeat, label: 'Metal Swap' },
  { icon: Sparkles, label: 'AI Models' },
  { icon: Gem, label: 'Jewellery Design' },
  { icon: Film, label: 'Reels' },
];

// Inline Google "G" mark so we don't depend on an external asset.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 34.9 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

export default function Login({ navigate }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const goLegal = (to) => (e) => {
    e.preventDefault();
    if (navigate) navigate(to);
    else window.location.assign(to);
  };

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // On success the browser redirects to Google, then back to the site.
    } catch (e) {
      setError(e.message || 'Could not start Google sign-in.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.particles} aria-hidden />
      <div className={styles.sweep} aria-hidden />

      <div className={styles.box}>
        <div className={styles.brand}>
          <img src="/swarnix-studio-logo.png" alt="Swarnix Studio" className={styles.logoImg} />
        </div>

        <div className={styles.heroSection}>
          <h1 className={styles.title}>Studio-quality jewellery photos and reels, <em>in seconds.</em></h1>
          <p className={styles.sub}>
            Turn plain counter photos into clean studio shots, AI-model campaigns,
            metal swaps, reels and fresh designs. Sign in and start with
            <b> 3 free credits</b> — no approval, no wait.
          </p>
        </div>

        <div className={styles.perks}>
          {PERKS.map(({ icon: Icon, label }) => (
            <div key={label} className={styles.perk}>
              <Icon size={14} /> <span>{label}</span>
            </div>
          ))}
        </div>

        <button className={styles.googleBtn} onClick={onGoogle} disabled={busy}>
          {busy ? <div className="spinner spinner-sm" /> : <GoogleMark />}
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>

        {error && <p className={styles.error}>{error}</p>}

        <p className={styles.legal}>
          By continuing, you agree to our{' '}
          <a href="/terms-of-service" onClick={goLegal('/terms-of-service')}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy-policy" onClick={goLegal('/privacy-policy')}>Privacy Policy</a>.
          Use only your own or licensed images — credits are non-refundable once used.
        </p>
      </div>
    </div>
  );
}
