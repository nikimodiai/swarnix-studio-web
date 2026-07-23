// ── Store branding ────────────────────────────────────────────────────
// Shop name, phone and logo a jeweller sets once and reuses across share
// features (Daily Gold Rate poster, festival posters, WhatsApp catalog).
// Stored on the user's own app_profiles row, which is client-writable for
// display fields under the "profiles_update_own_safe" RLS policy.

import { db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from './config';
import { compressImage } from './imageUtils';

/** Persist the branding fields on the current user's profile row. */
export async function saveStoreBranding(userId, { storeName, storePhone, storeLogoUrl, upiId }) {
  const { error } = await db
    .from('app_profiles')
    .update({
      store_name: storeName?.trim() || null,
      store_phone: storePhone?.trim() || null,
      store_logo_url: storeLogoUrl || null,
      upi_id: upiId?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw error;
}

/** Upload a picked logo image to Cloudinary and return its URL (unsaved). */
export async function uploadStoreLogo(file) {
  const compressed = await compressImage(file, { maxPx: 600, quality: 0.9 });
  const fd = new FormData();
  fd.append('file', compressed, 'logo.jpg');
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-store-branding');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Could not upload that logo. Try another image.');
  return (await res.json()).secure_url;
}
