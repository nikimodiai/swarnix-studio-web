import React, { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { N8N_CONTACT_SUPPORT } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './ContactSupportForm.module.css';

// Modal form for "Explore the Swarnix Full Suite" (see WhatsAppNudge) — collects
// the jeweller's details and routes them to support@nelishkaai.in via a signed
// n8n workflow (the browser has no mail-sending credentials of its own).
export default function ContactSupportForm({ onClose }) {
  const { store } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(store?.store_phone || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = name.trim() && phone.trim() && !sending;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(N8N_CONTACT_SUPPORT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          message: message.trim(),
          owner_id: store?.owner_id || null,
          store_name: store?.store_name || null,
          to: 'support@nelishkaai.in',
        }),
        credentials: 'omit',
        mode: 'cors',
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError('Could not send your request. Please try again, or email support@nelishkaai.in directly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Contact Support" onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close"><X size={16} /></button>

        {sent ? (
          <div className={styles.doneState}>
            <div className={styles.doneIcon}><Check size={22} /></div>
            <h2 className={styles.title}>Request sent</h2>
            <p className={styles.sub}>Our team will reach out to you shortly to walk you through the full Swarnix Suite.</p>
            <button className={styles.primaryBtn} onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 className={styles.title}>Talk to our team</h2>
            <p className={styles.sub}>
              Tell us a bit about your shop and we'll walk you through the WhatsApp AI agent,
              smart inventory, dynamic pricing and the rest of the Swarnix Full Suite.
            </p>

            <label className={styles.field}>
              <span>Your name</span>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rakesh Shah" required />
            </label>

            <label className={styles.field}>
              <span>Phone number</span>
              <input className={styles.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 98765 43210" required />
            </label>

            <label className={styles.field}>
              <span>Anything to add? <span className={styles.muted}>· optional</span></span>
              <textarea className={styles.textarea} maxLength={500} value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. how many staff, current WhatsApp setup, what you're hoping to solve…" />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.primaryBtn} type="submit" disabled={!canSubmit}>
              {sending ? (<><Loader2 size={15} className={styles.spin} /> Sending…</>) : 'Send to our team'}
            </button>
            <p className={styles.fineprint}>Or email us directly at <b>support@nelishkaai.in</b>.</p>
          </form>
        )}
      </div>
    </div>
  );
}
