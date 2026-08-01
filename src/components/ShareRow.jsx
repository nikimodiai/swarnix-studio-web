import { useState } from 'react';
import { Share2, MessageCircle, Link2, Download } from 'lucide-react';
import { nativeShareMedia, shareToWhatsApp, copyLink, downloadMedia } from '../lib/share';
import styles from './ShareRow.module.css';

// Drop-in share row for a single generated image/reel, shown right on the
// result screen (mirrors the lightbox share row in StudioLibrary).
export default function ShareRow({ url, name = 'swarnix.jpg', title = 'Swarnix Studio', onToast }) {
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    setSharing(true);
    try {
      const res = await nativeShareMedia([{ url, name }], { title });
      if (res === 'unsupported') shareToWhatsApp(url);
    } finally { setSharing(false); }
  };

  const doCopy = async () => {
    const ok = await copyLink(url);
    onToast?.(ok ? 'Link copied.' : 'Could not copy link.', ok);
  };

  return (
    <div className={styles.row}>
      <button className={styles.btn} disabled={sharing} onClick={share}>
        {sharing ? <div className="spinner spinner-sm" /> : <Share2 size={16} />} Share
      </button>
      <button className={`${styles.btn} ${styles.wa}`} onClick={() => shareToWhatsApp(url)}>
        <MessageCircle size={16} /> WhatsApp
      </button>
      <button className={styles.btn} onClick={doCopy}>
        <Link2 size={16} /> Copy link
      </button>
      <button className={styles.btn} onClick={() => downloadMedia(url, name)}>
        <Download size={16} /> Download
      </button>
    </div>
  );
}
