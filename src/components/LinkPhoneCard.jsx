import React, { useState, useCallback } from 'react';
import { ShieldCheck, X, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import PhoneOtpForm from './PhoneOtpForm';
import styles from './LinkPhoneCard.module.css';

// Prompts a Google-only user to attach their WhatsApp number to THIS account.
//
// This is the duplicate-account guard, not an upsell. Supabase's phone provider
// mints a NEW uid for an unknown number, and every app_* table is keyed on
// user_id — so a Google user who later "logs in with WhatsApp" without linking
// first would land in a second account with a separate credit balance and an
// empty Library. Linking here makes that impossible for anyone who accepts.
//
// Shown at most twice, then dropped: it's a nudge, not a wall. Users who never
// link can still sign in with Google forever.

const DISMISS_KEY = 'swarnix-link-phone-dismissed';
const MAX_DISMISSALS = 2;

function readDismissals() {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) || 0);
  } catch {
    return 0;
  }
}

export default function LinkPhoneCard() {
  const { hasPhone, sendLinkOtp, verifyLinkOtp, profile } = useAuth();
  const [dismissals, setDismissals] = useState(readDismissals);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const dismiss = useCallback(() => {
    const next = dismissals + 1;
    setDismissals(next);
    try { window.localStorage.setItem(DISMISS_KEY, String(next)); } catch { /* ignore */ }
  }, [dismissals]);

  // Already linked, or the user has waved it away enough times.
  if (hasPhone && !done) return null;
  if (dismissals >= MAX_DISMISSALS && !open) return null;

  if (done) {
    return (
      <div className={`${styles.card} ${styles.doneCard}`}>
        <div className={`${styles.icon} ${styles.doneIcon}`}><Check size={20} /></div>
        <div className={styles.body}>
          <h3 className={styles.title}>WhatsApp number linked</h3>
          <p className={styles.text}>
            You can now sign in with either Google or your WhatsApp number — both
            open this same account, with your credits and Library intact.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <button className={styles.close} onClick={dismiss} aria-label="Not now">
        <X size={15} />
      </button>

      <div className={styles.icon}><ShieldCheck size={20} /></div>

      <div className={styles.body}>
        <h3 className={styles.title}>Add your WhatsApp number</h3>
        <p className={styles.text}>
          Link it once and you can sign in with either Google or WhatsApp — same
          account, same credits, same Library. We’ll send a one-time code to
          confirm it’s yours.
        </p>

        {open ? (
          <div className={styles.formWrap}>
            <PhoneOtpForm
              onSend={sendLinkOtp}
              onVerify={verifyLinkOtp}
              onDone={() => { setOpen(false); setDone(true); }}
              initialPhone={profile?.store_phone || ''}
              submitLabel="Send code on WhatsApp"
              autoFocus
            />
          </div>
        ) : (
          <button className={styles.cta} onClick={() => setOpen(true)}>
            Link my number
          </button>
        )}
      </div>
    </div>
  );
}
