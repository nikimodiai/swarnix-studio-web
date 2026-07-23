import React, { useState } from 'react';
import {
  Gem, Sparkles, Camera, Repeat, Film, Images, ArrowLeft, Play,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { suiteUnitsLeft } from '../lib/studioSuite';
import DesignStudio from './DesignStudio';
import AIModelStudio from './studio/AIModelStudio';
import StudioPhoto from './studio/StudioPhoto';
import MetalSwap from './studio/MetalSwap';
import ReelStudio from './studio/ReelStudio';
import StudioLibrary from './studio/StudioLibrary';
import styles from './StudioSuite.module.css';

// The six Studio Suite features. `render` gets an { onBack } prop so each feature
// can return to the hub. All of them charge the shared credit balance.
//
// `media`: optional preview shown on the tile — { type: 'image'|'video', src }.
// Drop a file in /public and point `src` at it (e.g. '/previews/studio-photo.jpg').
// Until an asset is set, the tile falls back to an icon on a gradient card so the
// grid never looks broken.
const FEATURES = [
  {
    id: 'studio_photo',
    label: 'Studio Photo',
    desc: 'Turn a plain product photo into a clean, studio-lit shot.',
    icon: Camera,
    media: { type: 'image', src: '/previews/studio-photo.jpg' },
    render: (props) => <StudioPhoto {...props} />,
  },
  {
    id: 'metal_swap',
    label: 'Metal Swap',
    desc: 'Recolour a piece into yellow, white or rose gold — instantly.',
    icon: Repeat,
    media: { type: 'image', src: '/previews/metal-swap.jpg' },
    render: (props) => <MetalSwap {...props} />,
  },
  {
    id: 'jewellery_design',
    label: 'Jewellery Design',
    desc: 'Describe a piece or upload a reference, and generate a photorealistic render.',
    icon: Gem,
    media: { type: 'image', src: '/previews/design.jpg' },
    render: (props) => <DesignStudio {...props} />,
  },
  {
    id: 'ai_model',
    label: 'AI Model',
    desc: 'Put your jewellery on a photorealistic model.',
    icon: Sparkles,
    media: { type: 'image', src: '/previews/ai-models.jpg' },
    render: (props) => <AIModelStudio {...props} />,
  },
  {
    id: 'reels',
    label: 'Generate Reels',
    desc: 'Turn your photos into a short, shareable video with motion and music.',
    icon: Film,
    media: { type: 'video', src: '/previews/swarnix-reel.mp4' },
    render: (props) => <ReelStudio {...props} />,
  },
  {
    id: 'library',
    label: 'Library',
    desc: 'Every photo and video you’ve generated with Studio Suite.',
    icon: Images,
    media: { type: 'image', src: '/previews/library.png' },
    render: (props) => <StudioLibrary {...props} />,
  },
];

function TileMedia({ media, icon: Icon, id }) {
  if (media?.type === 'image') {
    return <img src={media.src} alt="" className={styles.tileMediaImg} />;
  }
  if (media?.type === 'video') {
    return (
      <>
        <video
          className={styles.tileMediaImg}
          src={media.src}
          muted loop playsInline autoPlay
        />
        <span className={styles.tilePlayBadge}><Play size={12} fill="currentColor" /></span>
      </>
    );
  }
  // Fallback: icon on a gradient card, distinct per feature so the grid still
  // reads well before real preview media is added.
  return (
    <div className={`${styles.tileMediaFallback} ${styles['grad_' + id]}`}>
      <Icon size={30} strokeWidth={1.5} />
    </div>
  );
}

export default function StudioSuite({ onNavigate }) {
  const { store } = useAuth();
  const [active, setActive] = useState(null); // null = hub, else feature id

  const left = suiteUnitsLeft(store);

  if (active) {
    const feat = FEATURES.find((f) => f.id === active);
    if (feat) return feat.render({ onBack: () => setActive(null), onNavigate });
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        {FEATURES.map((f) => (
          <button key={f.id} className={styles.tile} onClick={() => setActive(f.id)}>
            <div className={styles.tileMedia}>
              <TileMedia media={f.media} icon={f.icon} id={f.id} />
            </div>
            <div className={styles.tileBody}>
              <h3 className={styles.tileTitle}>{f.label}</h3>
              <p className={styles.tileDesc}>{f.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Shared sub-feature header — a back button + title, reused by every feature
// screen so they all return to the hub consistently.
export function SuiteFeatureHeader({ onBack, icon: Icon, title, sub, right }) {
  return (
    <div className={styles.featHeader}>
      <button className={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={16} /> AI Studio Suite
      </button>
      <div className={styles.featTitleRow}>
        <div className={styles.featTitleLeft}>
          <h1 className={styles.title}>{Icon ? <Icon size={20} /> : null} {title}</h1>
          {sub && <p className={styles.sub}>{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
