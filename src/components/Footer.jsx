import React from 'react';
import { Wand2 } from 'lucide-react';
import { site } from '../lib/site';
import styles from './Footer.module.css';

// `navigate` is optional — pages inside the app shell (no path-based routing
// wired at that call site) fall back to a plain page navigation.
export default function Footer({ navigate, onBuyCredits }) {
  const go = (to) => {
    if (navigate) navigate(to);
    else window.location.assign(to);
  };
  const buyCredits = () => {
    if (onBuyCredits) onBuyCredits();
    else go('/');
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <div className={styles.brand}>
              <span className={styles.logo}><Wand2 size={16} /></span>
              <span className={styles.brandName}>Swarnix Studio</span>
            </div>
            <p className={styles.tagline}>
              AI tools to shoot, restyle, design and animate your jewellery — studio photos,
              metal swaps, AI models, designs and reels, all in one place.
            </p>
          </div>

          <div className={styles.cols}>
            <div className={styles.col}>
              <p className={styles.colTitle}>Studio Suite</p>
              <ul className={styles.linkList}>
                <li><button className={styles.link} onClick={() => go('/')}>Studio Photo</button></li>
                <li><button className={styles.link} onClick={() => go('/')}>Metal Swap</button></li>
                <li><button className={styles.link} onClick={() => go('/')}>AI Model</button></li>
                <li><button className={styles.link} onClick={() => go('/')}>Jewellery Design</button></li>
                <li><button className={styles.link} onClick={() => go('/')}>Generate Reels</button></li>
              </ul>
            </div>

            <div className={styles.col}>
              <p className={styles.colTitle}>Company</p>
              <ul className={styles.linkList}>
                <li><a className={styles.linkAnchor} href={`mailto:${site.email}`}>Contact support</a></li>
                <li><button className={styles.link} onClick={buyCredits}>Buy credits</button></li>
              </ul>
            </div>

            <div className={styles.col}>
              <p className={styles.colTitle}>Legal</p>
              <ul className={styles.linkList}>
                <li><button className={styles.link} onClick={() => go('/privacy-policy')}>Privacy Policy</button></li>
                <li><button className={styles.link} onClick={() => go('/terms-of-service')}>Terms of Service</button></li>
              </ul>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>© {site.year} {site.company}. All rights reserved.</p>
          <div className={styles.bottomLinks}>
            <button onClick={() => go('/privacy-policy')}>Privacy Policy</button>
            <button onClick={() => go('/terms-of-service')}>Terms of Service</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
