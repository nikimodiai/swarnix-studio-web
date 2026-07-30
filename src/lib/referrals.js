// ── Referral program — client helpers ────────────────────────────────
// The reward logic itself lives entirely in Postgres (see
// supabase/migrations/referral_program.sql): a trigger on app_transactions
// pays both sides only on the referred user's FIRST completed purchase, never
// on signup. This module just reads/generates the code and lists a user's
// referral history — it has no ability to grant credits itself.

import { db } from './config';

/** Get (or lazily create) the current user's referral code. */
export async function getOrCreateReferralCode() {
  const { data, error } = await db.rpc('app_get_or_create_referral_code');
  if (error) throw error;
  return data;
}

/** Build the shareable invite link for a referral code. */
export function referralLink(code) {
  return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
}

/**
 * This user's referral history — everyone they've referred, newest first.
 * Uses the referred_name/referred_email SNAPSHOT taken at signup time (see
 * referral_program_v2 migration) rather than a live cross-user profile read,
 * since RLS only lets a user read their own app_profiles row.
 * { id, name, email, status, creditsAwarded, createdAt, rewardedAt }[]
 */
export async function fetchMyReferrals() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];
  const { data, error } = await db
    .from('app_referrals')
    .select('id, status, credits_awarded, created_at, rewarded_at, referred_name, referred_email')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.referred_name || null,
    email: r.referred_email || null,
    status: r.status,
    creditsAwarded: r.credits_awarded ?? 0,
    createdAt: r.created_at,
    rewardedAt: r.rewarded_at,
  }));
}

/**
 * Is the CURRENT user a referred user who hasn't yet earned their referral
 * bonus? True only while their own referral row is still 'pending' — i.e. they
 * were invited but haven't completed their first purchase. It flips to
 * 'rewarded' (or 'blocked') the moment they buy, so this naturally returns
 * false afterwards. Used to show the "buy a pack to also unlock N bonus
 * credits" nudge on the Buy Credits screen, and only then.
 * RLS lets a user read their own referral row via referred_id = auth.uid().
 */
export async function hasPendingReferralBonus() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data, error } = await db
    .from('app_referrals')
    .select('id')
    .eq('referred_id', user.id)
    .eq('status', 'pending')
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export const REFERRAL_REWARD_CREDITS = 10;
export const REFERRAL_CAP = 10;
// Minimum first-purchase amount (₹) that unlocks the referral bonus. MUST stay
// in sync with public.app_referral_min_purchase() in the DB — the server is the
// source of truth; this is only for display copy on the Buy Credits nudge.
export const REFERRAL_MIN_PURCHASE_INR = 399;
