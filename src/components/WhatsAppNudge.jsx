import React, { useState, useCallback } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { SWARNIX_WA_NUMBER } from '../lib/config';
import ContactSupportForm from './ContactSupportForm';
import styles from './WhatsAppNudge.module.css';

// Post-signup nudge: invite the jeweller to message the Swarnix WhatsApp agent.
//
// WHY THIS IS IN-APP AND NOT IN THE OTP MESSAGE: Meta's AUTHENTICATION template
// category permits exactly one variable (the code) and forbids URLs, media and
// custom marketing copy. A nudge inside the OTP would be rejected. In-app is
// also free, whereas a separate marketing template costs ~₹0.78 per send and
// puts the WABA's quality rating — and therefore the customer agent's number —
// at risk. See docs/WHATSAPP_AUTH_PLAN.md §4.
//
// FRAMING: the number runs SWARNIX's agent, not the jeweller's own store agent
// with their own inventory. The copy says "see how it works", NOT "this is your
// customers browsing your inventory" — the latter overpromises and the demo
// would underdeliver.
//
// FREQUENCY: first-time plus one re-nudge, then never again. Nudging on every
// login trains people to ignore it. localStorage is deliberate for v1 (cheap,
// per-device); promote to a profile column if we ever need it cross-device.

const DISMISS_KEY = 'swarnix-wa-nudge-dismissed';
const MAX_DISMISSALS = 2;

function readDismissals() {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) || 0);
  } catch {
    return 0;
  }
}

export default function WhatsAppNudge() {
  const { hasPhone } = useAuth();
  const [dismissals, setDismissals] = useState(readDismissals);
  const [supportOpen, setSupportOpen] = useState(false);

  const dismiss = useCallback(() => {
    const next = dismissals + 1;
    setDismissals(next);
    try { window.localStorage.setItem(DISMISS_KEY, String(next)); } catch { /* ignore */ }
  }, [dismissals]);

  // "Opened WhatsApp" is as close to "has engaged" as we can observe from the
  // browser, so treat it as a full dismissal rather than showing it again.
  const open = useCallback(() => {
    try { window.localStorage.setItem(DISMISS_KEY, String(MAX_DISMISSALS)); } catch { /* ignore */ }
    setDismissals(MAX_DISMISSALS);
  }, []);

  if (dismissals >= MAX_DISMISSALS) return null;

  const waLink = `https://wa.me/${SWARNIX_WA_NUMBER}?text=${encodeURIComponent('Hi')}`;

  return (
    <div className={styles.card}>
      <button className={styles.close} onClick={dismiss} aria-label="Dismiss">
        <X size={15} />
      </button>

      <div className={styles.icon}><MessageCircle size={20} /></div>

      <div className={styles.body}>
        <h3 className={styles.title}>
          {hasPhone
            ? 'That code came from our AI number.'
            : 'Meet the Swarnix WhatsApp AI agent.'}
        </h3>
        <p className={styles.text}>
          Say “Hi” to it and see how the assistant works — it answers customer
          questions about jewellery in Hindi, Gujarati, Marathi, English and more.
          This is the same assistant Swarnix can put on your shop’s number to
          handle enquiries and drive sales.
        </p>
        <a
          className={styles.cta}
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={open}
        >
          <MessageCircle size={15} /> Say “Hi” on WhatsApp
        </a>

        <p className={styles.suiteNote}>
          This agent is part of the <b>Swarnix Full Suite</b> — WhatsApp AI agent, smart
          inventory, dynamic jewellery pricing and more. To know more,{' '}
          <button type="button" className={styles.suiteLink} onClick={() => setSupportOpen(true)}>
            contact our support team
          </button>.
        </p>
      </div>

      {supportOpen && <ContactSupportForm onClose={() => setSupportOpen(false)} />}
    </div>
  );
}
