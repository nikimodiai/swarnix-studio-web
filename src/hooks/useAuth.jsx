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
  'store_name, store_phone, store_logo_url, upi_id, referral_code, created_at, ' +
  'phone_verified_at';

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

// Records a pending referral code. MUST be called only AFTER the user's
// app_profiles row exists (loadProfile upsert), because app_record_referral
// snapshots the profile and the app_referrals.referred_id FK points at it —
// calling too early returns 'no_profile' and records nothing.
//
// We latch a localStorage guard so we don't re-attempt on every render, but
// ONLY on a terminal outcome. A transient failure (no_profile yet, or a thrown
// network error) leaves the guard unset so the next auth event / reload retries
// — otherwise a single early/failed call would lose the referral forever.
async function maybeRecordReferral() {
  const RECORDED_KEY = 'swarnix-referral-recorded';
  try {
    if (window.localStorage.getItem(RECORDED_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('ref') || window.localStorage.getItem(PENDING_REF_KEY);
    if (!code) return; // nothing to record (don't latch — a code may arrive later)

    const { data: status, error } = await db.rpc('app_record_referral', {
      p_referral_code: code,
      p_fingerprint: getOrCreateDeviceFingerprint(),
    });
    // Retry later on error or if the profile wasn't ready yet.
    if (error || status === 'no_profile') return;

    // Terminal outcome (recorded / exists / invalid / no_code) — stop retrying
    // and clear the stashed code.
    window.localStorage.setItem(RECORDED_KEY, '1');
    window.localStorage.removeItem(PENDING_REF_KEY);
  } catch {
    // Best-effort — never block sign-in, and leave the guard unset so a later
    // auth event retries.
  }
}

// Claims the phone-number free-credit grant. MUST run only AFTER the profile
// row exists (same ordering constraint as maybeRecordReferral — the RPC returns
// 'no_profile' otherwise).
//
// Free credits are per-account, and a burner SIM is cheaper to farm than a
// burner Gmail, so the grant is ledgered against the NUMBER (app_phone_grants),
// not the uid. A recycled number returns 'already_used' and the server has
// already zeroed that account's free allowance.
//
// Retry discipline mirrors maybeRecordReferral: latch the guard only on a
// terminal outcome so a transient failure retries on the next auth event.
// Returns true when the RPC changed server-side profile state, so the caller
// knows to re-read the profile it may have already loaded.
async function maybeClaimPhoneGrant() {
  const CLAIMED_KEY = 'swarnix-phone-grant-claimed';
  try {
    if (window.localStorage.getItem(CLAIMED_KEY)) return false;
    const { data: status, error } = await db.rpc('app_claim_phone_grant');
    if (error || status === 'no_profile') return false; // transient — retry later

    // 'granted' | 'already_used' | 'no_phone' are all terminal. 'no_phone' is
    // the normal case for a Google-only user; latching it is correct because
    // verifyLinkOtp() clears the guard when a number is actually attached.
    window.localStorage.setItem(CLAIMED_KEY, '1');

    // Both of these wrote to app_profiles (phone_verified_at/store_phone, and
    // free_tryons_used on a recycled number), so the caller's copy is stale.
    return status === 'granted' || status === 'already_used';
  } catch {
    // Best-effort — never block sign-in.
    return false;
  }
}

export function AuthProvider({ children }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  // app_pricing.free_quota is authoritative and read below; this fallback only
  // covers the brief window before that read resolves.
  const [freeQuota, setFreeQuota] = useState(10);

  // Ensure an app_profiles row exists for this user, then read it back.
  //
  // Phone-first signups have NO email and no Google metadata, so every field
  // here is nullable. We also avoid overwriting an existing full_name/avatar
  // with nulls when a Google user later signs in by phone — hence the
  // conditional spread rather than always sending the key.
  const loadProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return; }
    const fullName =
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;
    const avatarUrl = user.user_metadata?.avatar_url ?? null;

    const { data, error } = await db
      .from('app_profiles')
      .upsert(
        {
          id: user.id,
          ...(user.email ? { email: user.email } : {}),
          ...(fullName ? { full_name: fullName } : {}),
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
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
      // Both of these depend on the profile row existing, so they run only
      // AFTER loadProfile resolves. Grant first: it can zero out the free
      // allowance for a recycled number, and app_record_referral consults the
      // same ledger, so claiming first keeps the two consistent.
      loadProfile(data.session?.user ?? null).finally(async () => {
        if (data.session?.user) {
          // The grant RPC can mutate the profile we just read, so re-read when
          // it reports a change — otherwise the first render after linking
          // shows a stale credit balance / unverified phone.
          if (await maybeClaimPhoneGrant()) await loadProfile(data.session.user);
          maybeRecordReferral();
        }
        if (active) setInitializing(false);
      });
    });

    const { data: sub } = db.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s?.user ?? null).finally(async () => {
        if (s?.user) {
          if (await maybeClaimPhoneGrant()) await loadProfile(s.user);
          maybeRecordReferral();
        }
      });
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

  // ── WhatsApp OTP ───────────────────────────────────────────────────
  // Supabase Auth generates and validates the code; our send-whatsapp-otp Auth
  // Hook delivers it from the Swarnix WABA (+91 7506407254) rather than from a
  // Twilio number, which is what makes the "message this same number" nudge
  // coherent.
  //
  // IMPORTANT — two different flows, two different verifyOtp types:
  //   LOGIN : signInWithOtp        → verifyOtp({ type: 'sms' })
  //   LINK  : updateUser({ phone }) → verifyOtp({ type: 'phone_change' })
  // Using 'sms' for the link flow is the classic mistake and it fails.

  /** Start a WhatsApp OTP LOGIN. `phone` must already be E.164 (see lib/phone). */
  const sendLoginOtp = useCallback(async (phone) => {
    const { error } = await db.auth.signInWithOtp({
      phone,
      options: { channel: 'whatsapp' },
    });
    if (error) throw error;
  }, []);

  /** Complete a WhatsApp OTP LOGIN. Resolves to the new session. */
  const verifyLoginOtp = useCallback(async (phone, token) => {
    const { data, error } = await db.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw error;
    return data;
  }, []);

  /**
   * Attach a phone to the CURRENT account (the duplicate-account guard).
   * Without this, a Google user who later logs in by WhatsApp would get a
   * second uid — and therefore a second credit balance and gallery.
   */
  const sendLinkOtp = useCallback(async (phone) => {
    const { error } = await db.auth.updateUser({ phone }, { channel: 'whatsapp' });
    if (error) throw error;
  }, []);

  /** Confirm the linked phone, then re-claim the grant on the same uid. */
  const verifyLinkOtp = useCallback(async (phone, token) => {
    const { data, error } = await db.auth.verifyOtp({
      phone, token, type: 'phone_change',
    });
    if (error) throw error;
    // A number is now attached, so the earlier 'no_phone' latch is stale —
    // clear it and re-run so the ledger sees this number.
    try { window.localStorage.removeItem('swarnix-phone-grant-claimed'); } catch { /* ignore */ }
    await maybeClaimPhoneGrant();
    await loadProfile(data?.user ?? session?.user ?? null);
    return data;
  }, [loadProfile, session]);

  const signOut = useCallback(async () => {
    await db.auth.signOut();
    setProfile(null);
    // Guards are per-account, not per-browser: leaving them set would make the
    // next user on this device skip their own grant/referral claim.
    try {
      window.localStorage.removeItem('swarnix-phone-grant-claimed');
      window.localStorage.removeItem('swarnix-referral-recorded');
    } catch { /* ignore */ }
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

  // Has this account got a verified WhatsApp number attached? Drives the
  // "link your number" prompt. auth.users is authoritative; the profile mirror
  // is the fallback for when the session object is stale.
  const hasPhone = Boolean(session?.user?.phone || profile?.phone_verified_at);

  const value = useMemo(() => ({
    initializing,
    session,
    user: session?.user ?? null,
    profile,
    freeQuota,
    creditsRemaining,
    store,
    hasPhone,
    signInWithGoogle,
    sendLoginOtp,
    verifyLoginOtp,
    sendLinkOtp,
    verifyLinkOtp,
    signOut,
    refreshProfile,
    // Feature components call refreshStore() after a generation to re-read the
    // balance; alias it to refreshProfile.
    refreshStore: refreshProfile,
  }), [
    initializing, session, profile, freeQuota, creditsRemaining, store, hasPhone,
    signInWithGoogle, sendLoginOtp, verifyLoginOtp, sendLinkOtp, verifyLinkOtp,
    signOut, refreshProfile,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
