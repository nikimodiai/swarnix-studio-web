import React, { useEffect, useState } from 'react';
import { BarChart3, AlertCircle } from 'lucide-react';
import { fetchAnalytics } from '../../lib/analytics';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './Analytics.module.css';

/**
 * Owner-only analytics (P0-4). One page, plain tables, no charting library —
 * the six numbers that decide pricing and whether Studio stays a product.
 *
 * All aggregation happens in app_studio_analytics(), a SECURITY DEFINER rpc
 * that raises for non-admins. This page therefore holds no access logic of its
 * own beyond rendering whatever error comes back.
 */

const FEATURE_LABELS = {
  studio_photo: 'Studio Photo',
  metal_swap: 'Metal Swap',
  ai_model: 'AI Model',
  design: 'Jewellery Design',
  reel: 'Reels',
};

const pct = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));

export default function Analytics({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAnalytics()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message || 'Could not load analytics.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const overall = data?.overall;
  const conv = data?.free_to_paid;
  const repeat = data?.repeat_purchase;

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack} icon={BarChart3} title="Analytics"
        sub="First-pass accept rate, true unit cost, and repeat purchase."
      />

      {loading ? (
        <div className={styles.center}><div className="spinner" /></div>
      ) : error ? (
        <div className={styles.errorRow}><AlertCircle size={14} /><span>{error}</span></div>
      ) : (
        <div className={styles.wrap}>
          {/* Headline numbers */}
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>First-pass accept rate</span>
              <span className={styles.tileValue}>{pct(overall?.first_pass_rate)}</span>
              <span className={styles.tileSub}>{num(overall?.accepted)} of {num(overall?.generations)} kept</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Credits per usable image</span>
              <span className={styles.tileValue}>{overall?.credits_per_usable ?? '—'}</span>
              <span className={styles.tileSub}>true unit cost</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Free → paid conversion</span>
              <span className={styles.tileValue}>{pct(conv?.rate)}</span>
              <span className={styles.tileSub}>{num(conv?.converted)} of {num(conv?.free_users)} free users</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Repeat purchase (45d)</span>
              <span className={styles.tileValue}>{pct(repeat?.rate)}</span>
              <span className={styles.tileSub}>{num(repeat?.repeated)} of {num(repeat?.first_buyers)} buyers</span>
            </div>
          </div>

          {/* Per-feature breakdown + margin */}
          <h2 className={styles.h2}>By feature</h2>
          {(data?.by_feature?.length ?? 0) === 0 ? (
            <p className={styles.empty}>No generations logged yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Feature</th><th>Generated</th><th>Accepted</th>
                    <th>First-pass</th><th>Credits / usable</th><th>Provider cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_feature.map((f) => (
                    <tr key={f.feature}>
                      <td>{FEATURE_LABELS[f.feature] || f.feature}</td>
                      <td>{num(f.generations)}</td>
                      <td>{num(f.accepted)}</td>
                      <td>{pct(f.first_pass_rate)}</td>
                      <td>{f.credits_per_usable ?? '—'}</td>
                      <td>${Number(f.cost_usd ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Repeat-purchase cohorts, weeks since first purchase */}
          <h2 className={styles.h2}>Repeat purchase by cohort</h2>
          {(data?.cohorts?.length ?? 0) === 0 ? (
            <p className={styles.empty}>No purchases yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Week of first purchase</th><th>First-time buyers</th><th>Bought again (45d)</th><th>Rate</th></tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.week}>
                      <td>{c.week}</td>
                      <td>{num(c.first_buyers)}</td>
                      <td>{num(c.repeated)}</td>
                      <td>{c.first_buyers > 0 ? pct(c.repeated / c.first_buyers) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className={styles.foot}>
            Revenue {num(data?.revenue?.gross_ex_gst)} ex-GST across {num(data?.revenue?.transactions)} paid
            transactions · {num(overall?.failures)} failed generations logged.
          </p>
        </div>
      )}
    </div>
  );
}
