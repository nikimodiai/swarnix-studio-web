// Sharing helpers for Library media (images + reels).
//
// Prefer the device's native share sheet (navigator.share) which, on mobile, can
// attach the ACTUAL image/video file so WhatsApp/Instagram receive media, not a
// link. Where that isn't available (most desktops) fall back to a WhatsApp link,
// copy-link, and download.

async function urlToFile(url, fallbackName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch failed');
  const blob = await res.blob();
  const ext = blob.type.includes('video') ? 'mp4'
    : blob.type.includes('png') ? 'png'
    : 'jpg';
  const name = fallbackName || `swarnix-${Date.now()}.${ext}`;
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

export function canShareFiles(files) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files }));
}

// items: [{ url, name? }]. Returns 'shared' | 'unsupported' | 'cancelled'.
export async function nativeShareMedia(items, { title = 'Swarnix Studio', text = '' } = {}) {
  if (!navigator.share) return 'unsupported';
  try {
    const files = [];
    for (const it of items) {
      try { files.push(await urlToFile(it.url, it.name)); } catch { /* skip unfetchable */ }
    }
    if (files.length && canShareFiles(files)) {
      await navigator.share({ files, title, text });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text: `${text ? text + '\n' : ''}${items.map((i) => i.url).join('\n')}` });
      return 'shared';
    }
    return 'unsupported';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export function shareToWhatsApp(urls, message = '') {
  const list = Array.isArray(urls) ? urls : [urls];
  const body = `${message ? message + '\n\n' : ''}${list.join('\n')}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
}

export async function copyLink(urls) {
  const text = (Array.isArray(urls) ? urls : [urls]).join('\n');
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export async function downloadMedia(url, name) {
  try {
    const file = await urlToFile(url, name);
    const objectUrl = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}
