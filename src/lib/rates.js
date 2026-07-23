// ── Daily metal rates (IBJA) ─────────────────────────────────────────
// Read straight from the `daily_metal_rates` table (public_read_rates RLS
// policy — anyone signed in can read it directly, no webhook, no credits). A
// separate n8n workflow refreshes it from IBJA each day. Rates are stored per
// 10 grams, INR. Ported from the mobile swarnix-studio app's lib/rates.ts so
// both surfaces show identical numbers.

import { db } from './config';

/**
 * Which metals to show, in poster order. Keys are the BASE metal (no session
 * suffix): IBJA publishes a morning (_am) then an afternoon (_pm) rate for
 * each — e.g. gold_916_am / gold_916_pm — and which one is present changes
 * through the day. We match on the base and prefer the later (_pm) rate.
 */
const DISPLAY = [
  { base: 'gold_999', label: '24K Gold', caption: '999 · 24 Karat' },
  { base: 'gold_916', label: '22K Gold', caption: '916 · 22 Karat' },
  { base: 'gold_750', label: '18K Gold', caption: '750 · 18 Karat' },
  { base: 'silver_999', label: 'Silver', caption: '999 · Fine Silver', isSilver: true },
];

function localToday() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Format an INR amount with Indian digit grouping. No decimals. */
export function formatInr(n) {
  return Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** Long, human date for the poster header, e.g. "2 July 2026". */
export function formatRateDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Fetch the latest daily rates (22K/18K/24K gold + silver). Returns null if
 * the table has no rows yet or the read fails.
 */
export async function fetchLatestRates() {
  const { data: latest, error: latestErr } = await db
    .from('daily_metal_rates')
    .select('rate_date')
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr || !latest?.rate_date) return null;

  const date = latest.rate_date;
  const { data, error } = await db
    .from('daily_metal_rates')
    .select('metal_key, rate_inr, source')
    .eq('rate_date', date);
  if (error || !data) return null;

  // Index rows by base metal (strip the _am/_pm session suffix), preferring
  // the afternoon (_pm) rate when both are present for the day.
  const byBase = new Map();
  for (const row of data) {
    const key = String(row.metal_key);
    const isPm = key.endsWith('_pm');
    const base = key.replace(/_(am|pm)$/i, '');
    const existing = byBase.get(base);
    if (!existing || (isPm && !existing.pm)) {
      byBase.set(base, { rate_inr: Number(row.rate_inr), source: row.source ?? null, pm: isPm });
    }
  }

  const rates = DISPLAY.flatMap(({ base, label, caption, isSilver }) => {
    const row = byBase.get(base);
    if (!row || !Number.isFinite(row.rate_inr)) return [];
    return [{
      metalKey: base,
      label,
      caption,
      isSilver,
      per10g: row.rate_inr,
      perGram: row.rate_inr / 10,
    }];
  });

  if (rates.length === 0) return null;

  const source = byBase.get('gold_916')?.source ?? data[0]?.source ?? null;
  return { date, isToday: date === localToday(), source, rates };
}

/**
 * Plain-text version of the rates for sharing, e.g. via WhatsApp link, when
 * a poster image can't be produced. Includes the shop name/phone if given.
 */
export function buildRateText(rates, branding) {
  const name = branding?.storeName?.trim();
  const phone = branding?.storePhone?.trim();
  const lines = [];
  lines.push(name ? `📊 ${name} — Today's Rate` : "📊 Today's Gold & Silver Rate");
  lines.push(formatRateDate(rates.date) + (rates.isToday ? '' : ' · last known'));
  lines.push('');
  for (const r of rates.rates) {
    lines.push(r.isSilver
      ? `${r.label}: ₹${formatInr(r.per10g)} / kg`
      : `${r.label}: ₹${formatInr(r.perGram)} / g`);
  }
  lines.push('');
  lines.push('Rate excl. GST & making charges');
  if (phone) lines.push(`📞 ${phone}`);
  return lines.join('\n');
}
