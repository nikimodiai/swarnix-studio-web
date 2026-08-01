import React, { useEffect, useState } from 'react';
import {
  Gem, LogOut, Plus, TrendingUp, PartyPopper, BookImage, Gift, Store, HelpCircle, BarChart3,
  Layers, Menu, X,
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
import Faq from './pages/studio/Faq';
import Analytics from './pages/studio/Analytics';
import { isStudioAdmin } from './lib/analytics';
import Footer from './components/Footer';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import styles from './App.module.css';

// Credit purchases are disabled while Razorpay runs on the test account only.
// Flip to true once the real bank account is integrated — every Buy entry
// point (topbar pill, avatar menu, footer, buy-credits route) keys off this.
export const PURCHASES_ENABLED = true;

// Topbar nav: the tools a jeweller reaches for most, one click away without
// digging into the hub grid. `render` gets an { onBack } prop, same contract
// as the Studio Suite features. Batch Studio is a hub feature (uses credits),
// not a standalone marketing page, so its entry deep-links into the hub via
// `openFeature` instead of rendering its own page — see Shell below.
const TOPBAR_FEATURES = [
  {
    id: 'batch',
    label: 'Batch Studio',
    desc: 'Generate up to 10 pieces at once — same settings, same model.',
    icon: Layers,
    openFeature: 'batch',
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
    isNew: true,
    render: (props) => <Referrals {...props} />,
  },
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
];

// Avatar menu: account-level tools. Buy credits comes first (added separately
// below, ahead of these), then setup/reference items that don't need to live
// in the primary nav.
const AVATAR_FEATURES = [
  {
    id: 'store_branding',
    label: 'Store Branding',
    desc: 'Shop name, logo & phone — used across every poster.',
    icon: Store,
    render: (props) => <StoreBranding {...props} />,
  },
  {
    id: 'faq',
    label: 'FAQ',
    desc: 'Credits, refunds, referrals and features — answered.',
    icon: HelpCircle,
    render: (props) => <Faq {...props} />,
  },
];

const ROUTABLE_FEATURES = [...TOPBAR_FEATURES, ...AVATAR_FEATURES];

function Topbar({ route, onNavigate }) {
  const { profile, creditsRemaining, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Analytics is owner-only and lives in the avatar menu rather than the hub —
  // the rpc enforces this server-side; hiding the link just avoids showing
  // every jeweller a door they can't open.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let active = true;
    isStudioAdmin().then((ok) => { if (active) setAdmin(ok); });
    return () => { active = false; };
  }, []);

  const go = (id) => { onNavigate(id); setMobileNavOpen(false); setMenuOpen(false); };

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarMain}>
        <button className={styles.brand} onClick={() => go('studio')}>
          <img src="/swarnix-studio-logo.png" alt="Swarnix Studio" className={styles.logoImg} />
          <span className={styles.brandName}>Swarnix Studio Suite</span>
        </button>

        {/* Desktop / tablet: full chip row. Hidden below the mobile breakpoint
            in favour of the hamburger drawer (small icon-only chips were
            unreadable on phones). */}
        <div className={styles.marketingRow}>
          {TOPBAR_FEATURES.map((f) => (
            <button
              key={f.id}
              className={`${styles.marketingChip} ${route === f.id ? styles.marketingChipActive : ''}`}
              onClick={() => go(f.id)}
              title={f.desc}
            >
              <span className={`${styles.chipIcon} ${styles['grad_' + f.id]}`}>
                <f.icon size={14} strokeWidth={1.8} />
              </span>
              <span className={styles.chipLabel}>{f.label}</span>
              {f.isNew && <span className={styles.newBadge}>New</span>}
            </button>
          ))}
        </div>

        <div className={styles.topbarRight}>
          <div className={styles.creditsPill} title="Credits are shared across every Studio Suite feature">
            <Gem size={13} />
            <b>{creditsRemaining}</b>
            <span className={styles.creditsWord}>credits</span>
            {PURCHASES_ENABLED ? (
              <button className={styles.buyBtn} onClick={() => go('buy-credits')}>
                <Plus size={12} /> Buy
              </button>
            ) : (
              <button className={styles.buyBtn} disabled style={{ opacity: 0.55, cursor: "default" }} title="Credit packs are coming soon">
                Coming soon
              </button>
            )}
          </div>

          {/* Mobile: hamburger opens a full nav drawer instead of squeezing
              every chip down to a bare icon. */}
          <button
            className={styles.hamburgerBtn}
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

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
                  <button className={styles.menuItem} disabled={!PURCHASES_ENABLED} style={PURCHASES_ENABLED ? undefined : { opacity: 0.55, cursor: "default" }} onClick={() => { if (!PURCHASES_ENABLED) return; go('buy-credits'); }}>
                    <Gem size={15} /> {PURCHASES_ENABLED ? 'Buy credits' : 'Buy credits — coming soon'}
                  </button>
                  {AVATAR_FEATURES.map((f) => (
                    <button key={f.id} className={styles.menuItem} onClick={() => go(f.id)}>
                      <f.icon size={15} /> {f.label}
                    </button>
                  ))}
                  {admin && (
                    <button className={styles.menuItem} onClick={() => go('analytics')}>
                      <BarChart3 size={15} /> Analytics
                    </button>
                  )}
                  <button className={styles.menuItem} onClick={() => { setMenuOpen(false); signOut(); }}>
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav drawer — the same TOPBAR_FEATURES, but as a readable list
          instead of icon-only chips. */}
      {mobileNavOpen && (
        <>
          <div className={styles.mobileNavScrim} onClick={() => setMobileNavOpen(false)} />
          <nav className={styles.mobileNav}>
            {TOPBAR_FEATURES.map((f) => (
              <button
                key={f.id}
                className={`${styles.mobileNavItem} ${route === f.id ? styles.mobileNavItemActive : ''}`}
                onClick={() => go(f.id)}
              >
                <span className={`${styles.chipIcon} ${styles['grad_' + f.id]}`}>
                  <f.icon size={15} strokeWidth={1.8} />
                </span>
                <span className={styles.mobileNavLabel}>{f.label}</span>
                {f.isNew && <span className={styles.newBadge}>New</span>}
              </button>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}

// In-app screens ('studio' | 'buy-credits' | a ROUTABLE_FEATURES id) are
// pushed onto browser history as a location.hash so the hardware/browser
// back button steps back through app screens instead of popping out of the
// SPA entirely (which used to strand the user on a stale reload that
// resolved as signed-out). Falls back to 'studio' — the app's homepage —
// once the in-app history is exhausted, rather than leaving the app.
function useShellRoute() {
  const initial = window.location.hash.slice(1) || 'studio';
  const [route, setRouteState] = useState(initial);

  useEffect(() => {
    const onPop = () => setRouteState(window.location.hash.slice(1) || 'studio');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setRoute = (id) => {
    if (id !== window.location.hash.slice(1)) {
      window.history.pushState({}, '', id === 'studio' ? window.location.pathname : `#${id}`);
    }
    setRouteState(id);
    window.scrollTo(0, 0);
  };

  return [route, setRoute];
}

function Shell({ navigate }) {
  const { initializing, session } = useAuth();
  const [route, setRoute] = useShellRoute(); // 'studio' | 'buy-credits' | a ROUTABLE_FEATURES id
  // Set when the topbar's Batch Studio button (or anything else with
  // `openFeature`) is clicked — passed to StudioSuite so it deep-links into
  // the hub feature instead of showing the tile grid first.
  const [hubOpenFeature, setHubOpenFeature] = useState(null);

  if (initializing) {
    return <div className={styles.boot}><div className="spinner" /></div>;
  }
  if (!session) return <Login navigate={navigate} />;

  const routedFeature = ROUTABLE_FEATURES.find((f) => f.id === route);

  const onNavigate = (id) => {
    const feat = ROUTABLE_FEATURES.find((f) => f.id === id);
    if (feat?.openFeature) {
      // Hub feature (uses credits) — stay on the 'studio' route and hand the
      // target straight to StudioSuite rather than rendering a separate page.
      setHubOpenFeature(feat.openFeature);
      setRoute('studio');
      return;
    }
    setRoute(id);
  };

  return (
    <div className={styles.app}>
      <Topbar route={route} onNavigate={onNavigate} />
      <main className={styles.main}>
        <div className={styles.mainInner}>
          {routedFeature && !routedFeature.openFeature
            ? routedFeature.render({ onBack: () => setRoute('studio'), onNavigate })
            : route === 'buy-credits' && PURCHASES_ENABLED
              ? <BuyCredits onBack={() => setRoute('studio')} />
              : route === 'analytics'
                ? <Analytics onBack={() => setRoute('studio')} />
                : (
                  <StudioSuite
                    onNavigate={onNavigate}
                    openFeature={hubOpenFeature}
                    onOpenFeatureHandled={() => setHubOpenFeature(null)}
                  />
                )}
        </div>
        <Footer navigate={navigate} onBuyCredits={PURCHASES_ENABLED ? () => setRoute('buy-credits') : null} />
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
