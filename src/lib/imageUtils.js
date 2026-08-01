import { N8N_CLOUDINARY_DELETE } from './config';

// Best-effort delete of a temp SOURCE upload (a device/camera photo uploaded
// solely to run one generation) once that generation is done — success or
// failure. Deliberately swallows all errors: a stray temp upload left behind
// is a Cloudinary storage cost, not a correctness issue, so a delete failure
// must never surface to the user or block the result they're waiting on.
// NEVER call this for a Library-sourced image (srcUrl / already-hosted pick)
// — those are the user's permanent saved generations, not temp uploads.
export async function deleteTempUpload(publicId) {
  if (!publicId) return;
  try {
    await fetch(N8N_CLOUDINARY_DELETE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id: publicId }),
      credentials: 'omit',
      mode: 'cors',
    });
  } catch {
    // best-effort — ignore
  }
}

// Share an image URL as an actual file via Web Share API (files).
// WhatsApp and other apps receive the image directly instead of a link.
// Falls back to sharing the URL as text if file-sharing is unsupported.
export async function shareImageFile(imageUrl, { title = 'Jewellery', text = 'Check out this jewellery! 💎' } = {}) {
  if (!navigator.share) return false;
  try {
    if (navigator.canShare) {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const file = new File([blob], `jewellery.${ext}`, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return true;
      }
    }
    await navigator.share({ title, text, url: imageUrl });
    return true;
  } catch {
    return false;
  }
}

// Compress an image File or Blob before uploading to Cloudinary, converting
// it to webp along the way — Cloudinary's f_webp/fetch_format only affects
// delivery, not what's actually stored, so this is the only way to make sure
// every asset we upload (regardless of the source PNG/JPG the user picked)
// is stored as webp. Target: ≤1200px on longest side, quality 0.82.
export async function compressImage(source, { maxPx = 1200, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const url = source instanceof File ? URL.createObjectURL(source) : source;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (source instanceof File) URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'));
        },
        'image/webp',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
