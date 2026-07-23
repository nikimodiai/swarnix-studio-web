import React, { useState } from 'react';
import { Sparkles, Images } from 'lucide-react';
import { CATEGORIES } from '../../lib/config';
import { useToast } from '../../hooks/useToast';
import AIModelPanel from '../../components/AIModelPanel';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './AIModelStudio.module.css';

/**
 * Standalone AI Model feature (Studio Suite). Reuses the proven AIModelPanel —
 * same webhook, chips, lightbox and share. Every generated photo is already
 * auto-saved to the shared Library (app_gallery, kind='ai_model') inside the
 * panel, so on this site the panel's "Add" action just confirms the save and
 * points the jeweller at their Library, rather than pushing into an owner
 * inventory (which doesn't exist on the Studio Suite site).
 */
export default function AIModelStudio({ onBack, onNavigate }) {
  const { showToast } = useToast();
  const [category, setCategory] = useState('');

  const onSaved = () => {
    showToast('Saved to your Library.', '#166534');
  };

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={Sparkles}
        title="AI Model"
        sub="Put your jewellery on a photorealistic model — ready for your catalogue and socials."
      />

      {/* Category — AIModelPanel needs it to place the piece correctly. */}
      <div className={styles.catBlock}>
        <label className={styles.catLabel}>Jewellery category</label>
        <select
          className={styles.catSelect}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Auto (let AI decide)</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label || c.value}</option>
          ))}
        </select>
        <p className={styles.catHint}>
          <Images size={13} /> Every photo you generate is saved to your <b>Library</b> automatically.
        </p>
      </div>

      {/* The proven panel. On this site "Add" just confirms the library save. */}
      <AIModelPanel category={category} onAddImage={onSaved} addLabel="Saved ✓" />
    </div>
  );
}
