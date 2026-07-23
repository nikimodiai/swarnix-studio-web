import React from 'react';
import { Wand2, ArrowLeft } from 'lucide-react';
import Footer from '../../components/Footer';
import styles from './Legal.module.css';

export default function LegalLayout({ title, updated, intro, sections, navigate }) {
  return (
    <div className={styles.wrap}>
      <header className={styles.topbar}>
        <button className={styles.brand} onClick={() => navigate('/')}>
          <span className={styles.logo}><Wand2 size={16} /></span>
          <span className={styles.brandName}>Swarnix Studio</span>
        </button>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> Back to Studio
        </button>
      </header>

      <div className={styles.container}>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.h1}>{title}</h1>
        <p className={styles.updated}>Last updated: {updated}</p>
        {intro}

        {sections.map((s) => (
          <section key={s.id} id={s.id} className={styles.section}>
            <h2 className={styles.h2}>{s.title}</h2>
            {s.body}
          </section>
        ))}

        <p className={styles.footNote}>
          Questions? Email us at <a href="mailto:support@nelishkaai.in">support@nelishkaai.in</a>.
        </p>
      </div>

      <Footer navigate={navigate} />
    </div>
  );
}
