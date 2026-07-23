import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { db } from '../lib/config';

// ── Auth + profile (Google OAuth, NO approval) ──────────────────────
// Mirrors the mobile swarnix-studio AuthContext: sign in with Google, ensure an
// app_profiles row, and read the credit balance. There is NO approval gate — the
// moment a user signs in they get their app_pricing.free_quota free credits.
//
// COMPAT SHAPE: the six Studio Suite feature components were ported verbatim from
// the Swarnix owner web app, where they read a `store` object. Here we expose a
// small `store` shim so those components work unchanged:
//   store.owner_id            → the auth uid (also app_profiles.id, RLS key)
//   store._ai_studio_suite_*  → mapped onto the credit balance so the shared
//                               studioSuite.js helpers report "credits left"
//   store.plan_name           → always a plan that unlocks Studio Suite
// The single source of truth for credits is app_profiles + the credit RPCs;
// the shim is a read-only projection refreshed by refreshStore().

const AuthContext = createContext(null);

const PROFILE_COLUMNS =
  'id, email, full_name, avatar_url, free_tryons_used, paid_credits, plan, ' +
  'store_name, store_phone, store_logo_url, upi_id, referral_code, created_at';

// Coarse, non-PII signup fingerprint (persisted in localStorage) used only to
// flag same-device referral self-abuse — see app_record_referral in the
// referral_program migration. Not a tracking id; never sent anywhere except
// that one RPC call.
function getOrCreateDeviceFingerprint() {
  const KEY = 'swarnix-device-fp';
  try {
    let fp = window.localStorage.getItem(KEY);
    if (!fp) {
      fp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(KEY, fp);
    }
    return fp;
  } catch {
    return null;
  }
}

// Google's OAuth redirect drops any query string on the way back (redirectTo
// is just the bare origin — see signInWithGoogle below), so a `?ref=CODE` on
// the landing page would otherwise be lost by the time the session resolves.
// We stash it in localStorage the moment the app loads (before the user even
// clicks "Continue with Google"), so it survives the round trip.
const PENDING_REF_KEY = 'swarnix-pending-referral-code';
(function capturePendingReferralCode() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) window.localStorage.setItem(PENDING_REF_KEY, code);
  } catch {
    // ignore
  }
})();

// Records a pending referral code exactly once per browser via a
// localStorage guard so re-loading the app doesn't re-attempt
// app_record_referral every render.
async function maybeRecordReferral() {
  const RECORDED_KEY = 'swarnix-referral-recorded';
  try {
    if (window.localStorage.getItem(RECORDED_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('ref') || window.localStorage.getItem(PENDING_REF_KEY);
    if (!code) return;
    window.localStorage.setItem(RECORDED_KEY, '1');
    await db.rpc('app_record_referral', {
      p_referral_code: code,
      p_fingerprint: getOrCreateDeviceFingerprint(),
    });
    window.localStorage.removeItem(PENDING_REF_KEY);
  } catch {
    // Best-effort — never block sign-in on this.
  }
}

export function AuthProvider({ children }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [freeQuota, setFreeQuota] = useState(3); // app_pricing.free_quota; refined after load

  // Ensure an app_profiles row exists for this user, then read it back.
  const loadProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return; }
    const { data, error } = await db
      .from('app_profiles')
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name:
            user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        },
        { onConflict: 'id' }
      )
      .select(PROFILE_COLUMNS)
      .single();
    if (!error && data) setProfile(data);
  }, []);

  useEffect(() => {
    let active = true;
    db.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) maybeRecordReferral();
      loadProfile(data.session?.user ?? null).finally(() => {
        if (active) setInitializing(false);
      });
    });

    const { data: sub } = db.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s?.user ?? null);
      if (s?.user) maybeRecordReferral();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  // Read the owner-configured free allowance once signed in (RLS only exposes
  // app_pricing to authenticated users). Keeps the client's free-credit math in
  // step with the server instead of trusting the hardcoded fallback.
  useEffect(() => {
    if (!session) return;
    let active = true;
    db.from('app_pricing')
      .select('free_quota')
      .eq('key', 'default')
      .eq('active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data && typeof data.free_quota === 'number') setFreeQuota(data.free_quota);
      });
    return () => { active = false; };
  }, [session]);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = window.location.origin;
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await db.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user ?? null),
    [loadProfile, session]
  );

  // Total credits remaining = (free_quota − free_used, floored) + paid_credits.
  const creditsRemaining = useMemo(() => {
    if (!profile) return 0;
    const free = Math.max(0, freeQuota - (profile.free_tryons_used || 0));
    return free + (profile.paid_credits || 0);
  }, [profile, freeQuota]);

  // ── Compat `store` shim consumed by the ported feature components ──
  // The ported components read the balance via the studioSuite.js helpers, which
  // in this app resolve to `_credits_remaining` (see src/lib/studioSuite.js).
  // We also carry a used/limit pair purely so the meter bar in the hub renders.
  const store = useMemo(() => {
    if (!session?.user) return null;
    const freeUsed = Math.min(freeQuota, profile?.free_tryons_used || 0);
    return {
      owner_id: session.user.id,
      _credits_remaining: creditsRemaining,       // authoritative balance
      _ai_studio_suite_used: freeUsed,            // free credits consumed (for the meter)
      _ai_studio_suite_limit: creditsRemaining + freeUsed, // total this account has seen
      plan_name: 'studio',                        // forces hasFeature('ai_studio_suite') = true
    };
  }, [session, profile, freeQuota, creditsRemaining]);

  const value = useMemo(() => ({
    initializing,
    session,
    user: session?.user ?? null,
    profile,
    freeQuota,
    creditsRemaining,
    store,
    signInWithGoogle,
    signOut,
    refreshProfile,
    // Feature components call refreshStore() after a generation to re-read the
    // balance; alias it to refreshProfile.
    refreshStore: refreshProfile,
  }), [initializing, session, profile, freeQuota, creditsRemaining, store, signInWithGoogle, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
