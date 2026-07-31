import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import { toE164, isValidPhone, formatPhone, toLocalDigits } from '../lib/phone';
import styles from './PhoneOtpForm.module.css';

// Two-step WhatsApp OTP form: number entry → code entry.
//
// Deliberately mode-agnostic — the caller supplies `onSend`/`onVerify`, so the
// SAME component drives both flows even though they use different Supabase
// calls underneath (login = signInWithOtp/'sms', link = updateUser/'phone_change').
// See useAuth.jsx.

const RESEND_SECONDS = 60; // must match MIN_RESEND_SECONDS in the edge function
const CODE_LENGTH = 6;

export default function PhoneOtpForm({
  onSend,          // (e164) => Promise<void>
  onVerify,        // (e164, token) => Promise<void>
  onDone,          // called after a successful verify
  initialPhone = '',
  submitLabel = 'Continue with WhatsApp',
  autoFocus = false,
}) {
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [local, setLocal] = useState(toLocalDigits(initialPhone));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const phoneRef = useRef(null);
  const codeRef = useRef(null);

  const e164 = toE164(local);
  const phoneOk = isValidPhone(local);

  useEffect(() => {
    if (autoFocus) phoneRef.current?.focus();
  }, [autoFocus]);

  // Resend cooldown. The server enforces this too (and charges us for every
  // send), so the timer is a courtesy that avoids a guaranteed 429.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = useCallback(async () => {
    if (!phoneOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(e164);
      setStep('code');
      setCooldown(RESEND_SECONDS);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [phoneOk, busy, onSend, e164]);

  const verify = useCallback(async () => {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(e164, code);
      onDone?.();
    } catch (err) {
      setError(friendlyError(err));
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [code, busy, onVerify, e164, onDone]);

  // Auto-submit once the full code is in — saves a tap, and the code length is
  // fixed so there's no ambiguity about when the user is "done".
  useEffect(() => {
    if (step === 'code' && code.length === CODE_LENGTH && !busy) verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  if (step === 'code') {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.back}
          onClick={() => { setStep('phone'); setCode(''); setError(null); }}
        >
          <ArrowLeft size={14} /> Change number
        </button>

        <p className={styles.sentTo}>
          We sent a {CODE_LENGTH}-digit code on WhatsApp to<br />
          <b>{formatPhone(e164)}</b>
        </p>

        <input
          ref={codeRef}
          className={styles.codeInput}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          maxLength={CODE_LENGTH}
          disabled={busy}
          aria-label="WhatsApp verification code"
        />

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={verify}
          disabled={busy || code.length !== CODE_LENGTH}
        >
          {busy ? <div className="spinner spinner-sm" /> : null}
          {busy ? 'Verifying…' : 'Verify'}
        </button>

        <button
          type="button"
          className={styles.resend}
          onClick={send}
          disabled={busy || cooldown > 0}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.phoneRow}>
        <span className={styles.cc}>+91</span>
        <input
          ref={phoneRef}
          className={styles.phoneInput}
          value={local}
          onChange={(e) => setLocal(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="WhatsApp number"
          disabled={busy}
          aria-label="WhatsApp number"
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.waBtn}
        onClick={send}
        disabled={busy || !phoneOk}
      >
        {busy ? <div className="spinner spinner-sm" /> : <MessageCircle size={17} />}
        {busy ? 'Sending code…' : submitLabel}
      </button>
    </div>
  );
}

// Supabase/Meta errors are not user-facing prose. Map the ones a jeweller can
// actually hit; fall back to the raw message rather than swallowing anything.
function friendlyError(err) {
  const msg = String(err?.message ?? err ?? '');
  if (/expired/i.test(msg)) return 'That code has expired. Request a new one.';
  if (/invalid|incorrect|token/i.test(msg)) return 'That code isn’t right. Please check and try again.';
  if (/rate|too many|429/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/already registered|already been registered/i.test(msg)) {
    return 'That number is already on another Swarnix account. Sign in with it instead.';
  }
  if (/wait \d+s/i.test(msg)) return msg;
  return msg || 'Something went wrong. Please try again.';
}
