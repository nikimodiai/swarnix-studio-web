import React, { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { GUIDES } from '../lib/guides';
import styles from './GuideButton.module.css';

// Small "Guide" button for a feature's SuiteFeatureHeader `right` slot — opens
// a bilingual (EN/HI) step-by-step how-to for that feature. `id` must match a
// key in lib/guides.js.
export default function GuideButton({ id }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('en');
  const guide = GUIDES[id];
  if (!guide) return null;
  const hi = lang === 'hi';

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <BookOpen size={14} /> Guide
      </button>
      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={guide.title} onClick={(e) => e.stopPropagation()}>
            <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>

            <div className={styles.langToggle} role="group" aria-label="Language">
              <button type="button" className={`${styles.langBtn} ${!hi ? styles.langActive : ''}`} onClick={() => setLang('en')}>English</button>
              <button type="button" className={`${styles.langBtn} ${hi ? styles.langActive : ''}`} onClick={() => setLang('hi')}>हिंदी</button>
            </div>

            <h2 className={styles.title}>{hi ? guide.titleHi : guide.title}</h2>
            <ol className={styles.steps}>
              {(hi ? guide.stepsHi : guide.steps).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
