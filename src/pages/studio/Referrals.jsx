import React, { useCallback, useEffect, useState } from 'react';
import { Gift, Copy, Share2, Check } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import {
  getOrCreateReferralCode, referralLink, fetchMyReferrals, REFERRAL_REWARD_CREDITS,
} from '../../lib/referrals';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './Referrals.module.css';

const STATUS_LABEL = {
  rewarded: 'Referral Credits added',
  pending: 'Pending for purchase',
  blocked: 'Not eligible',
};

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Refer a jeweller, both get credits — but ONLY once the referred friend
 * completes their first real purchase (see the app_referral_reward_trigger
 * in the referral_program migration). This screen just shows the code/link
 * and the referrer's own history; it has no ability to grant credits.
 */
export default function Referrals({ onBack }) {
  const { showToast } = useToast();
  const [code, setCode] = useState(null);
  const [referrals, setReferrals] = useState(null); // null = loading
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, refs] = await Promise.all([getOrCreateReferralCode(), fetchMyReferrals()]);
      setCode(c);
      setReferrals(refs);
    } catch {
      setReferrals([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const link = code ? referralLink(code) : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Could not copy the link.', '#be123c');
    }
  };

  const shareLink = async () => {
    const text = `Join me on Swarnix Studio and get free AI photo credits! ${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Swarnix Studio', text, url: link }); return; } catch { /* dismissed */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={Gift}
        title="Refer & earn"
        sub="Invite another jeweller — you both get free credits once they make their first purchase."
      />

      <div className={styles.card}>
        <p className={styles.rewardLine}>
          <Gift size={16} /> You each get <b>{REFERRAL_REWARD_CREDITS} credits</b> when your friend buys their first credit pack.
        </p>

        {code === null ? (
          <div className={styles.center}><div className="spinner" /></div>
        ) : (
          <>
            <div className={styles.linkRow}>
              <input className={styles.linkInput} readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className={styles.copyBtn} onClick={copyLink}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button className={styles.shareBtn} onClick={shareLink}>
              <Share2 size={15} /> Share invite link
            </button>
          </>
        )}
      </div>

      <h2 className={styles.sectionTitle}>Your referrals</h2>
      {referrals === null ? (
        <div className={styles.center}><div className="spinner" /></div>
      ) : referrals.length === 0 ? (
        <p className={styles.empty}>No referrals yet — share your link to get started.</p>
      ) : (
        <div className={styles.rows}>
          {referrals.map((r) => (
            <div key={r.id} className={styles.row}>
              <div className={styles.rowMeta}>
                <span className={styles.rowName}>{r.name || r.email || 'A jeweller'}</span>
                {r.name && r.email && <span className={styles.rowEmail}>{r.email}</span>}
                <span className={styles.rowDate}>Signed up {formatDate(r.createdAt)}</span>
              </div>
              <div className={styles.rowRight}>
                <span className={`${styles.status} ${styles[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>
                {r.status === 'rewarded' && <span className={styles.rowCredits}>+{r.creditsAwarded} credits</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
