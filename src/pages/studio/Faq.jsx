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

  return (
    <div className={styles.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={HelpCircle}
        title="FAQ"
        sub="Credits, refunds, referrals and what each tool does — answered."
      />

      {FAQ_GROUPS.map((group, gi) => (
        <section key={group.title} className={styles.group}>
          <h2 className={styles.groupTitle}>{group.title}</h2>
          <div className={styles.list}>
            {group.items.map((item, ii) => {
              const id = `${gi}-${ii}`;
              const isOpen = open === id;
              return (
                <div key={item.q} className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
                  <button className={styles.q} onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}>
                    <span>{item.q}</span>
                    <ChevronDown size={16} className={styles.chev} />
                  </button>
                  {isOpen && <p className={styles.a}>{item.a}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
