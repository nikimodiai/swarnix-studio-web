import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Gem, Check, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { fetchCreditPacks, discountPct, formatINR } from '../lib/pricing';
import { createRazorpayOrder, openRazorpayCheckout, verifyRazorpayPayment } from '../lib/payments';
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

  useEffect(() => {
    let active = true;
    fetchCreditPacks()
      .then((p) => active && setPacks(p))
      .catch((e) => active && setError(e.message ?? 'Could not load packs'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const onPay = useCallback(async (pack) => {
    setPendingId(pack.id);
    setError(null);
    try {
      const order = await createRazorpayOrder(pack.id);
      const result = await openRazorpayCheckout(order);
      setVerifying(true);
      try {
        const { success, credits_added } = await verifyRazorpayPayment(result);
        await refreshProfile();
        setHistoryKey((k) => k + 1);
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
  }, [refreshProfile, showToast]);

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

      {error && <div className={styles.errorRow}><AlertCircle size={14} /><span>{error}</span></div>}

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
                    <span className={styles.price}>{formatINR(pack.discounted_price, pack.currency)}</span>
                    {pct > 0 && <span className={styles.strike}>{formatINR(pack.price, pack.currency)}</span>}
                  </div>
                </div>
                <button
                  className={`${styles.payBtn} ${featured ? styles.payBtnFeatured : ''}`}
                  onClick={() => onPay(pack)}
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
        Payments are processed securely by Razorpay. Credits never expire.
      </p>

      <TransactionHistory key={historyKey} />

      {verifying && (
        <div className={styles.overlay}>
          <Loader2 className={styles.spin} size={30} />
          <span>Confirming payment…</span>
        </div>
      )}
    </div>
  );
}
