// ── Phone helpers for WhatsApp OTP login ────────────────────────────
// Swarnix Studio sells to Indian jewellers, so +91 is the default country code
// and the UI only asks for the 10-digit number. We still store and send strict
// E.164, because that's what Supabase Auth keys on and what Meta expects.

export const DEFAULT_COUNTRY_CODE = '91';

// Indian mobile numbers are 10 digits starting 6-9. Landlines can't receive
// WhatsApp, so rejecting 0-5 prefixes up front saves a wasted (paid) send.
const IN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Normalise loose user input to E.164 ("+919876543210"), or null if it can't
 * be a valid WhatsApp-capable Indian mobile.
 *
 * Accepts: "9876543210", "+91 98765 43210", "091-9876543210", "919876543210".
 */
export function toE164(input, countryCode = DEFAULT_COUNTRY_CODE) {
  if (!input) return null;
  let digits = String(input).replace(/[^\d]/g, '');
  if (!digits) return null;

  // Strip the Indian trunk prefix and/or an already-present country code so
  // "0 98765…", "91 98765…" and a bare "98765…" all converge.
  if (digits.length > 10 && digits.startsWith(countryCode)) {
    digits = digits.slice(countryCode.length);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (countryCode === DEFAULT_COUNTRY_CODE && !IN_MOBILE.test(digits)) return null;
  if (digits.length < 6) return null;

  return `+${countryCode}${digits}`;
}

/** True if the input is a sendable number. */
export function isValidPhone(input, countryCode = DEFAULT_COUNTRY_CODE) {
  return toE164(input, countryCode) !== null;
}

/**
 * Display form for a stored E.164 number: "+91 98765 43210".
 * Falls back to the raw value for anything non-Indian.
 */
export function formatPhone(e164) {
  if (!e164) return '';
  const m = String(e164).match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : String(e164);
}

/** Partially hidden form for UI that shouldn't display a full number. */
export function maskPhone(e164) {
  if (!e164) return '';
  const s = String(e164);
  if (s.length < 6) return '***';
  return `${s.slice(0, 5)}*****${s.slice(-2)}`;
}

/** Strip to the 10 local digits, for prefilling the input from a stored value. */
export function toLocalDigits(e164, countryCode = DEFAULT_COUNTRY_CODE) {
  if (!e164) return '';
  const digits = String(e164).replace(/[^\d]/g, '');
  return digits.startsWith(countryCode) ? digits.slice(countryCode.length) : digits;
}
