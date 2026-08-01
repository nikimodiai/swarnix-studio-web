import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { SuiteFeatureHeader } from '../StudioSuite';
import { FAQ_GROUPS } from '../../lib/faq';
import styles from './Faq.module.css';

/**
 * In-app FAQ. Content lives in lib/faq.js (single source of truth) so the
 * answers stay in sync with the billing rules they describe.
 */
export default function Faq({ onBack }) {
  const [open, setOpen] = useState(null); // "groupIdx-itemIdx"
  const [lang, setLang] = useState('en'); // 'en' | 'hi'
  const hi = lang === 'hi';

  return (
    <div className={styles.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={HelpCircle}
        title="FAQ"
        sub={hi ? 'क्रेडिट, रिफंड, रेफरल और हर टूल के बारे में जानकारी।' : 'Credits, refunds, referrals and what each tool does — answered.'}
      />

      <div className={styles.langToggle} role="group" aria-label="Language">
        <button type="button" className={`${styles.langBtn} ${!hi ? styles.langActive : ''}`} onClick={() => setLang('en')}>English</button>
        <button type="button" className={`${styles.langBtn} ${hi ? styles.langActive : ''}`} onClick={() => setLang('hi')}>हिंदी</button>
      </div>

      {FAQ_GROUPS.map((group, gi) => (
        <section key={group.title} className={styles.group}>
          <h2 className={styles.groupTitle}>{hi ? group.titleHi : group.title}</h2>
          <div className={styles.list}>
            {group.items.map((item, ii) => {
              const id = `${gi}-${ii}`;
              const isOpen = open === id;
              return (
                <div key={item.q} className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
                  <button className={styles.q} onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
                    <span>{hi ? item.qHi : item.q}</span>
                    <ChevronDown size={16} className={styles.chev} />
                  </button>
                  {isOpen && <p className={styles.a}>{hi ? item.aHi : item.a}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
