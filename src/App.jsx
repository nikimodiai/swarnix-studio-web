import React, { useState } from 'react';
import {
  Gem, LogOut, Plus, TrendingUp, PartyPopper, BookImage, Gift, Store,
} from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { useRoute } from './hooks/useRoute';
import Login from './pages/Login';
import StudioSuite from './pages/StudioSuite';
import BuyCredits from './pages/BuyCredits';
import GoldRatePoster from './pages/studio/GoldRatePoster';
import FestivalPosters from './pages/studio/FestivalPosters';
import WhatsAppCatalog from './pages/studio/WhatsAppCatalog';
import Referrals from './pages/studio/Referrals';
import StoreBranding from './pages/studio/StoreBranding';
import Footer from './components/Footer';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import styles from './App.module.css';

// Free marketing tools — no credits used. Reached via compact chip buttons
// in the topbar (not the main 6-feature grid) so they stay one click away
// without crowding the hub. `render` gets an { onBack } prop, same contract
// as the Studio Suite features.
const MARKETING_FEATURES = [
  {
    id: 'gold_rate',
    label: 'Daily Gold Rate',
    desc: "Today's gold & silver rate from IBJA, with your branding — free.",
    icon: TrendingUp,
    render: (props) => <GoldRatePoster {...props} />,
  },
  {
    id: 'festival_posters',
    label: 'Festival Posters',
    desc: 'Diwali, Dhanteras, wedding season and more.',
    icon: PartyPopper,
    render: (props) => <FestivalPosters {...props} />,
  },
  {
    id: 'whatsapp_catalog',
    label: 'WhatsApp Catalog',
    desc: 'Turn your photos into a priced catalog.',
    icon: BookImage,
    render: (props) => <WhatsAppCatalog {...props} />,
  },
  {
    id: 'referrals',
    label: 'Refer & Earn',
    desc: 'Invite a jeweller — you both get 10 free credits.',
    icon: Gift,
    render: (props) => <Referrals {...props} />,
  },
  {
    id: 'store_branding',
    label: 'Store Branding',
    desc: 'Shop name, logo & phone — used across every poster.',
    icon: Store,
    render: (props) => <StoreBranding {...props} />,
  },
];

function Topbar({ route, onNavigate }) {
  const { profile, creditsRemaining, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={() => onNavigate('studio')}>
        <img src="/swarnix-studio-logo.png" alt="Swarnix Studio" className={styles.logoImg} />
        <span className={styles.brandName}>Swarnix Studio Suite</span>
      </button>

      <div className={styles.marketingRow}>
        {MARKETING_FEATURES.map((f) => (
          <button
            key={f.id}
            className={`${styles.marketingChip} ${route === f.id ? styles.marketingChipActive : ''}`}
            onClick={() => onNavigate(f.id)}
            title={f.desc}
          >
            <span className={`${styles.chipIcon} ${styles['grad_' + f.id]}`}>
              <f.icon size={14} strokeWidth={1.8} />
            </span>
            <span className={styles.chipLabel}>{f.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.topbarRight}>
        <div className={styles.creditsPill} title="Credits are shared across every Studio Suite feature">
          <Gem size={13} />
          <b>{creditsRemaining}</b>
          <span className={styles.creditsWord}>credits</span>
          <button className={styles.buyBtn} onClick={() => onNavigate('buy-credits')}>
            <Plus size={12} /> Buy
          </button>
        </div>

        <div className={styles.profileWrap}>
          <button className={styles.avatarBtn} onClick={() => setMenuOpen((v) => !v)}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
              : <span className={styles.avatarFallback}>{(profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}</span>}
          </button>
          {menuOpen && (
            <>
              <div className={styles.menuScrim} onClick={() => setMenuOpen(false)} />
              <div className={styles.menu}>
                <div className={styles.menuHead}>
                  <strong>{profile?.full_name || 'Signed in'}</strong>
                  <span>{profile?.email}</span>
                </div>
                <button className={styles.menuItem} onClick={() => { setMenuOpen(false); onNavigate('buy-credits'); }}>
                  <Gem size={15} /> Buy credits
                </button>
                <button className={styles.menuItem} onClick={() => { setMenuOpen(false); signOut(); }}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Shell({ navigate }) {
  const { initializing, session } = useAuth();
  const [route, setRoute] = useState('studio'); // 'studio' | 'buy-credits' | marketing feature id

  if (initializing) {
    return <div className={styles.boot}><div className="spinner" /></div>;
  }
  if (!session) return <Login navigate={navigate} />;

  const marketingFeature = MARKETING_FEATURES.find((f) => f.id === route);

  return (
    <div className={styles.app}>
      <Topbar route={route} onNavigate={setRoute} />
      <main className={styles.main}>
        <div className={styles.mainInner}>
          {marketingFeature
            ? marketingFeature.render({ onBack: () => setRoute('studio'), onNavigate: setRoute })
            : route === 'buy-credits'
              ? <BuyCredits onBack={() => setRoute('studio')} />
              : <StudioSuite onNavigate={setRoute} />}
        </div>
        <Footer navigate={navigate} onBuyCredits={() => setRoute('buy-credits')} />
      </main>
    </div>
  );
}

export default function App() {
  const [path, navigate] = useRoute();

  // Legal pages are reachable whether or not the user is signed in, and
  // render outside the auth gate / app shell.
  if (path === '/privacy-policy') return <PrivacyPolicy navigate={navigate} />;
  if (path === '/terms-of-service') return <TermsOfService navigate={navigate} />;

  return (
    <AuthProvider>
      <ToastProvider>
        <Shell navigate={navigate} />
      </ToastProvider>
    </AuthProvider>
  );
}
