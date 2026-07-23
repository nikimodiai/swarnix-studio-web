import React, { useEffect, useState } from 'react';
import { Gift, CreditCard, Loader2, Receipt } from 'lucide-react';
import { fetchTransactions, formatDateTime } from '../lib/transactions';
import { formatINR } from '../lib/pricing';
import styles from './TransactionHistory.module.css';

/**
 * Purchase / credit history, newest first. Reads app_transactions (real
 * Razorpay purchases) plus a synthesized signup welcome-bonus row. Rendered
 * on the Buy Credits screen so a jeweller can see exactly when each credit
 * pack was bought and for how much.
 */
export default function TransactionHistory() {
  const [txns, setTxns] = useState(null);

  useEffect(() => {
    let active = true;
    fetchTransactions()
      .then((t) => active && setTxns(t))
      .catch(() => active && setTxns([]));
    return () => { active = false; };
  }, []);

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <Receipt size={16} />
        <h2 className={styles.title}>Transaction history</h2>
      </div>

      {txns === null ? (
        <div className={styles.center}><Loader2 className={styles.spin} size={22} /></div>
      ) : txns.length === 0 ? (
        <p className={styles.empty}>No transactions yet.</p>
      ) : (
        <div className={styles.rows}>
          {txns.map((t) => (
            <div key={t.id} className={styles.row}>
              <div className={`${styles.icon} ${(t.isWelcome || t.isReferral) ? styles.iconFree : ''}`}>
                {(t.isWelcome || t.isReferral) ? <Gift size={16} /> : <CreditCard size={16} />}
              </div>
              <div className={styles.meta}>
                <span className={styles.rowTitle}>{t.title}</span>
                <span className={styles.rowSub}>
                  +{t.credits} credit{t.credits === 1 ? '' : 's'} · {formatDateTime(t.createdAt)}
                  {t.status === 'pending' ? ' · Pending' : ''}
                </span>
              </div>
              <span className={`${styles.amount} ${(t.isWelcome || t.isReferral) ? styles.amountFree : ''}`}>
                {t.isWelcome || t.isReferral || t.amount == null ? 'Free' : formatINR(t.amount, t.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
