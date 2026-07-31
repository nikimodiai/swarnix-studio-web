import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Gem, Check, Loader2, AlertCircle, Gift, Building2, ChevronDown } from 'lucide-react';
import { INDIAN_STATES } from '../lib/pricing';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { fetchCreditPacks, discountPct, formatINR, priceBreakup, GST_RATE } from '../lib/pricing';
import { createRazorpayOrder, openRazorpayCheckout, verifyRazorpayPayment } from '../lib/payments';
import { hasPendingReferralBonus, REFERRAL_REWARD_CREDITS, REFERRAL_MIN_PURCHASE_INR } from '../lib/referrals';
import TransactionHistory from '../components/TransactionHistory';
import styles from './BuyCredits.module.css';

/**
 * Buy Credits paywall (web). Lists active `studio_price` packs with a
 * strike-through MRP + discount ribbon, then runs the Razorpay flow:
 * create order → checkout.js → verify → refresh balance. The secret key never
 * touches the client — the edge functions own the price and the signature check.
 */
export default function BuyCredits({ onBack }) {
  const { refreshProfile, creditsRemaining } = useAuth();
  const { showToast } = useToast();

  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [historyKey, setHistoryKey] = useState(0); // bump to re-fetch history after a purchase
  // Show the referral nudge only to a referred user who hasn't purchased yet
  // (their referral row is still 'pending'). It disappears after their first
  // purchase, since completing a purchase flips the row to 'rewarded'.
  const [showReferralNudge, setShowReferralNudge] = useState(false);
  // Optional GST details for business buyers who want them on their receipt.
  const [showGstFields, setShowGstFields] = useState(false);
  const [gstin, setGstin] = useState('');
  const [state, setStateName] = useState('');
  // Pack awaiting confirmation. Listed prices are ex-GST, so we show the exact
  // payable total BEFORE handing over to Razorpay — otherwise the buyer meets a
  // number 18% higher than the card they just tapped.
  const [confirmPack, setConfirmPack] = useState(null);

  useEffect(() => {
    let active = true;
    fetchCreditPacks()
      .then((p) => active && setPacks(p))
      .catch((e) => active && setError(e.message ?? 'Could not load packs'))
      .finally(() => active && setLoading(false));
    hasPendingReferralBonus()
      .then((pending) => active && setShowReferralNudge(pending))
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const onPay = useCallback(async (pack) => {
    setConfirmPack(null);
    setPendingId(pack.id);
    setError(null);
    try {
      const order = await createRazorpayOrder(pack.id, { gstin: gstin.trim(), state: state.trim() });
      const result = await openRazorpayCheckout(order);
      setVerifying(true);
      try {
        const { success, credits_added } = await verifyRazorpayPayment(result);
        await refreshProfile();
        setHistoryKey((k) => k + 1);
        // Re-check server truth: a qualifying (≥ threshold) purchase flips the
        // referral to 'rewarded' and hides the nudge; a sub-threshold Starter
        // buy leaves it 'pending', so the nudge correctly stays.
        hasPendingReferralBonus().then(setShowReferralNudge).catch(() => {});
        if (success) {
          showToast(`${credits_added || order.credits} credits added 🎉`, '#166534');
        } else {
          showToast('Payment received — credits will appear shortly.', '#1D4ED8');
        }
      } catch {
        showToast('Payment may have gone through — credits will be added once confirmed.', '#1D4ED8');
      } finally {
        setVerifying(false);
      }
    } catch (e) {
      if (e?.code !== 'dismissed') setError(e.message ?? 'Could not start payment.');
    } finally {
      setPendingId(null);
    }
  }, [refreshProfile, showToast, gstin, state]);

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={16} /> Back to Studio
      </button>

      <div className={styles.head}>
        <h1 className={styles.title}><Gem size={20} /> Buy credits</h1>
        <p className={styles.sub}>
          Each credit is one AI photo or design generation. Reels cost by length &amp; quality.
          Bigger packs, bigger savings. You have <b>{creditsRemaining}</b> credit{creditsRemaining === 1 ? '' : 's'} left.
        </p>
      </div>

      {showReferralNudge && (
        <div className={styles.referralNudge}>
          <Gift size={18} />
          <span>
            You were invited through <b>Refer &amp; Earn</b> — buy the <b>Most Popular</b> pack or bigger
            (₹{REFERRAL_MIN_PURCHASE_INR}+) and you'll get an extra <b>{REFERRAL_REWARD_CREDITS} bonus credits</b> on top,
            added automatically after that purchase.
          </span>
        </div>
      )}

      {error && <div className={styles.errorRow}><AlertCircle size={14} /><span>{error}</span></div>}

      <div className={styles.gstBox}>
        <button
          type="button"
          className={styles.gstToggle}
          onClick={() => setShowGstFields((v) => !v)}
          aria-expanded={showGstFields}
        >
          <Building2 size={15} />
          <span>Buying for a business? Add GST details for your receipt</span>
          <ChevronDown size={15} className={`${styles.gstChevron} ${showGstFields ? styles.gstChevronOpen : ''}`} />
        </button>
        {showGstFields && (
          <div className={styles.gstFields}>
            <label className={styles.gstField}>
              <span>GSTIN (optional)</span>
              <input
                className={styles.gstInput}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27AQDPK3941M1ZK"
                maxLength={15}
                autoCapitalize="characters"
              />
            </label>
            <label className={styles.gstField}>
              <span>State (place of supply)</span>
              <select
                className={styles.gstInput}
                value={state}
                onChange={(e) => setStateName(e.target.value)}
              >
                <option value="">Select state…</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <p className={styles.gstHint}>
              These appear on your downloadable receipt and set the CGST/SGST vs IGST split. Leave blank if not needed.
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.center}><Loader2 className={styles.spin} size={26} /></div>
      ) : packs.length === 0 ? (
        <div className={styles.center}><p>No credit packs are available right now. Please check back soon.</p></div>
      ) : (
        <div className={styles.list}>
          {packs.map((pack) => {
            const pct = discountPct(pack);
            const featured = Boolean(pack.badge);
            return (
              <div key={pack.id} className={`${styles.card} ${featured ? styles.cardFeatured : ''}`}>
                {pack.badge && <div className={styles.badge}>{pack.badge}</div>}
                <div className={styles.cardTop}>
                  <div className={styles.creditsBlock}>
                    <div className={styles.creditsRow}>
                      <Gem size={16} />
                      <span className={styles.creditsNum}>{pack.credits}</span>
                      <span className={styles.creditsWord}>credits</span>
                    </div>
                    <span className={styles.packName}>{pack.name}</span>
                  </div>
                  <div className={styles.priceBlock}>
                    {pct > 0 && <span className={styles.discountPill}>{pct}% OFF</span>}
                    <span className={styles.price}>{formatINR(pack.discounted_price, pack.currency)}<span className={styles.gstStar}>*</span></span>
                    {pct > 0 && <span className={styles.strike}>{formatINR(pack.price, pack.currency)}</span>}
                    <span className={styles.payable}>
                      {formatINR(priceBreakup(pack.discounted_price).total, pack.currency)} payable
                    </span>
                  </div>
                </div>
                <button
                  className={`${styles.payBtn} ${featured ? styles.payBtnFeatured : ''}`}
                  onClick={() => setConfirmPack(pack)}
                  disabled={pendingId !== null || verifying}
                >
                  {pendingId === pack.id ? (<><Loader2 className={styles.spin} size={15} /> Starting…</>)
                    : (<><Check size={15} /> Pay now</>)}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className={styles.fineprint}>
        <b>*</b> Pack prices are exclusive of tax. <b>{Math.round(GST_RATE * 100)}% GST</b> is added at
        checkout — the <b>payable</b> figure on each pack is the exact amount you'll pay, and
        you'll see the full breakup before we hand you over to Razorpay.
      </p>
      <p className={styles.fineprint}>
        Payments are processed securely by Razorpay. Credits never expire.
      </p>

      <TransactionHistory key={historyKey} />

      {confirmPack && (() => {
        const { base, gst, total } = priceBreakup(confirmPack.discounted_price);
        const cur = confirmPack.currency;
        return (
          <div className={styles.confirmBackdrop} onClick={() => setConfirmPack(null)}>
            <div
              className={styles.confirmSheet}
              role="dialog"
              aria-modal="true"
              aria-label="Confirm your payment"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className={styles.confirmTitle}>Confirm your payment</h2>
              <p className={styles.confirmPack}>
                <b>{confirmPack.credits} credits</b> · {confirmPack.name}
              </p>
              <div className={styles.confirmRows}>
                <div className={styles.confirmRow}>
                  <span>Pack price</span><span>{formatINR(base, cur)}</span>
                </div>
                <div className={styles.confirmRow}>
                  <span>GST ({Math.round(GST_RATE * 100)}%)</span><span>{formatINR(gst, cur)}</span>
                </div>
                <div className={`${styles.confirmRow} ${styles.confirmTotal}`}>
                  <span>Total payable</span><span>{formatINR(total, cur)}</span>
                </div>
              </div>
              <p className={styles.confirmNote}>
                Razorpay will ask you to pay exactly {formatINR(total, cur)}.
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.confirmCancel} onClick={() => setConfirmPack(null)}>
                  Cancel
                </button>
                <button
                  className={styles.confirmPay}
                  onClick={() => onPay(confirmPack)}
                  disabled={pendingId !== null || verifying}
                >
                  <Check size={15} /> Pay {formatINR(total, cur)}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {verifying && (
        <div className={styles.overlay}>
          <Loader2 className={styles.spin} size={30} />
          <span>Confirming payment…</span>
        </div>
      )}
    </div>
  );
}
