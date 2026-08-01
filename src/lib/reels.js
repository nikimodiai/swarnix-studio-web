// Reel Generation — web integration (shared with the mobile studio).
//
// Backend touchpoints:
//  1. On the web we already hold a Cloudinary preset, so device images upload
//     directly (uploadReelImage) instead of via the reel-image-upload webhook.
//  2. reel-generate (n8n) — submit a job, returns job_id; the render runs in the
//     background and n8n's service role updates the reel_jobs row.
//  3. Supabase reel_jobs / reel_music — read under the user's session (RLS scopes
//     rows to user_id = auth.uid()). Live status via Realtime.
//
// Billing (web): credits are RESERVED up front at submit time (reelSuiteCost) via
// app_reserve_credits — reels render async, so reserve-on-submit stops a user
// queueing reels they can't pay for. n8n's trg_reel_refund_on_fail trigger
// refunds server-side if the row later flips to 'failed'; the ReelStudio screen
// also refunds the immediate case where submit throws before a row is created.

import {
  N8N_REEL_GENERATE, N8N_REEL_STORYBOARD, N8N_REEL_STORYBOARD_GENERATE,
  db, CLOUDINARY_CLOUD, CLOUDINARY_PRESET,
} from './config';
import { compressImage } from './imageUtils';

export const LENGTH_MIN = 4;
export const LENGTH_MAX = 24;
export const LENGTH_DEFAULT = 8;
export const MAX_REEL_IMAGES = 6;

export const RATIOS = [
  { value: '9:16', label: 'Instagram Reel / Status', hint: 'Vertical · the default for reels' },
  { value: '1:1', label: 'Instagram / Facebook Post', hint: 'Square feed post' },
  { value: '16:9', label: 'YouTube / Facebook Video', hint: 'Landscape' },
];
export const DEFAULT_RATIO = '9:16';

export const QUALITIES = [
  { value: '480p', label: 'SD', hint: 'Fastest, smallest file' },
  { value: '720p', label: 'HD', hint: 'Recommended' },
  { value: '1080p', label: 'Full HD', hint: 'Best quality' },
];
export const DEFAULT_RESOLUTION = '720p';

// Shared with AI Model (src/components/AIModelPanel.jsx) so the same
// backdrop vocabulary works across stills and reels; 'custom' opens a
// free-text field (see BACKGROUND_CUSTOM sentinel) instead of a preset.
export const BACKGROUND_CUSTOM = 'custom';
export const BACKGROUNDS = [
  { value: 'none',         label: 'No change',       hint: 'Keep the background from your photos as-is.' },
  { value: 'studio_white', label: 'Studio white',    hint: 'Clean white studio — the standard e-commerce look.' },
  { value: 'studio_grey',  label: 'Studio grey',     hint: 'Neutral grey studio — soft and premium.' },
  { value: 'beige',        label: 'Beige',           hint: 'Warm beige backdrop — flatters gold jewellery.' },
  { value: 'gradient',     label: 'Soft gradient',   hint: 'Soft colour gradient — modern and vibrant.' },
  { value: 'mandap',       label: 'Wedding mandap',  hint: 'Decorated wedding stage — for bridal sets.' },
  { value: 'palace',       label: 'Palace',          hint: 'Royal palace interior — luxurious, regal feel.' },
  { value: 'outdoor',      label: 'Outdoor bokeh',   hint: 'Blurred outdoor background — natural lifestyle look.' },
  { value: BACKGROUND_CUSTOM, label: 'Custom…',      hint: 'Describe your own background.' },
];
export const DEFAULT_BACKGROUND = 'none';
const BACKGROUND_PROMPT_TEXT = {
  studio_white: 'a clean white studio background',
  studio_grey: 'a neutral grey studio background',
  beige: 'a warm beige backdrop',
  gradient: 'a soft colour gradient background',
  mandap: 'a decorated wedding mandap / stage background',
  palace: 'a royal palace interior background',
  outdoor: 'a blurred outdoor bokeh background',
};

// Folds the chosen background into the free-text prompt sent to n8n — the
// reel pipeline has no dedicated background field, so this is appended to
// customPrompt rather than requiring a backend change.
export function backgroundPromptPhrase(background, customText) {
  if (!background || background === 'none') return '';
  if (background === BACKGROUND_CUSTOM) return (customText || '').trim();
  return BACKGROUND_PROMPT_TEXT[background] || '';
}

// `value` is sent to n8n as `overlay_font` and must match a font file the
// ffmpeg render server has installed — these are Google Fonts names (the
// server-side workflow needs those font files available; falls back to its
// own default if a name isn't found). `css` is only used for the browser
// preview via GOOGLE_FONTS_HREF below.
export const OVERLAY_FONTS = [
  { value: 'Poppins', label: 'Poppins', css: "'Poppins', sans-serif" },
  { value: 'Montserrat', label: 'Montserrat', css: "'Montserrat', sans-serif" },
  { value: 'Playfair Display', label: 'Playfair Display', css: "'Playfair Display', serif" },
  { value: 'Oswald', label: 'Oswald', css: "'Oswald', sans-serif" },
  { value: 'Raleway', label: 'Raleway', css: "'Raleway', sans-serif" },
  { value: 'Lato', label: 'Lato', css: "'Lato', sans-serif" },
  { value: 'Merriweather', label: 'Merriweather', css: "'Merriweather', serif" },
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond', css: "'Cormorant Garamond', serif" },
  { value: 'Dancing Script', label: 'Dancing Script', css: "'Dancing Script', cursive" },
  { value: 'Pacifico', label: 'Pacifico', css: "'Pacifico', cursive" },
  { value: 'Bebas Neue', label: 'Bebas Neue', css: "'Bebas Neue', sans-serif" },
  { value: 'Anton', label: 'Anton', css: "'Anton', sans-serif" },
  { value: 'Great Vibes', label: 'Great Vibes', css: "'Great Vibes', cursive" },
  { value: 'Cinzel', label: 'Cinzel', css: "'Cinzel', serif" },
  { value: 'Josefin Sans', label: 'Josefin Sans', css: "'Josefin Sans', sans-serif" },
  { value: 'Roboto Slab', label: 'Roboto Slab', css: "'Roboto Slab', serif" },
  { value: 'Abril Fatface', label: 'Abril Fatface', css: "'Abril Fatface', serif" },
  { value: 'Quicksand', label: 'Quicksand', css: "'Quicksand', sans-serif" },
  { value: 'Courier Prime', label: 'Mono', css: "'Courier Prime', monospace" },
  { value: 'Caveat', label: 'Caveat', css: "'Caveat', cursive" },
];
export const DEFAULT_OVERLAY_FONT = 'Poppins';
// One <link> loads previews for every font above — used once by ReelStudio.
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  OVERLAY_FONTS.map((f) => `family=${encodeURIComponent(f.value).replace(/%20/g, '+')}:wght@400;700`).join('&') +
  '&display=swap';

export const OVERLAY_COLORS = [
  { value: 'white', label: 'White', css: '#ffffff' },
  { value: 'gold', label: 'Gold', css: '#C9A84C' },
  { value: 'cream', label: 'Cream', css: '#F4F0E8' },
  { value: 'navy', label: 'Navy', css: '#0B1829' },
  { value: 'black', label: 'Black', css: '#000000' },
  { value: 'red', label: 'Red', css: '#BE123C' },
  { value: 'rose_gold', label: 'Rose Gold', css: '#E0A899' },
  { value: 'antique_gold', label: 'Antique Gold', css: '#B08D57' },
  { value: 'silver', label: 'Silver', css: '#C0C0C8' },
  { value: 'emerald', label: 'Emerald', css: '#1F5C4D' },
  { value: 'royal_blue', label: 'Royal Blue', css: '#1D3E8C' },
  { value: 'maroon', label: 'Maroon', css: '#7A1F2B' },
  { value: 'blush_pink', label: 'Blush Pink', css: '#F2C9D4' },
  { value: 'mustard', label: 'Mustard', css: '#D4A017' },
  { value: 'teal', label: 'Teal', css: '#0C3A38' },
  { value: 'charcoal', label: 'Charcoal', css: '#2B2B2E' },
  { value: 'ivory', label: 'Ivory', css: '#FFFFF0' },
  { value: 'coral', label: 'Coral', css: '#E8734A' },
  { value: 'plum', label: 'Plum', css: '#5C2A4D' },
  { value: 'sky_blue', label: 'Sky Blue', css: '#7EC8E3' },
];
export const DEFAULT_OVERLAY_COLOR = 'white';

export const MAX_MUSIC_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadReelMusic(file) {
  if (file.size > MAX_MUSIC_BYTES) throw new Error('Music file is over 10 MB. Please pick a shorter track.');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-reel-music');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Could not upload that music file. Try another.');
  return (await res.json()).secure_url;
}

const REEL_JOB_COLUMNS = 'id, status, output_url, error_message, ratio, length_seconds, resolution, created_at';

function mapJob(row) {
  return {
    id: row.id,
    status: row.status,
    outputUrl: row.output_url ?? null,
    errorMessage: row.error_message ?? null,
    ratio: row.ratio ?? null,
    lengthSeconds: row.length_seconds ?? null,
    resolution: row.resolution ?? null,
    createdAt: row.created_at,
  };
}

export function endOverlayDuration(lengthSeconds) {
  return Math.min(4, Math.max(1, Math.ceil(lengthSeconds / 2)));
}

export async function uploadReelImage(fileOrBlob, filename = 'reel.webp') {
  const compressed = await compressImage(fileOrBlob);
  const fd = new FormData();
  fd.append('file', compressed, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-reels');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return (await res.json()).secure_url;
}

export async function submitReel({ userId, imageUrls, lengthSeconds, ratio, resolution, customPrompt, musicId, musicUrl, overlayText, overlayPosition, overlayFont, overlayColor }) {
  if (!imageUrls?.length) throw new Error('Add at least one image for your reel.');
  const body = {
    user_id: userId,
    image1_url: imageUrls[0],
    image_urls: imageUrls,
    length_seconds: lengthSeconds,
    ratio,
    resolution,
  };
  if (imageUrls[1]) body.image2_url = imageUrls[1];
  if (customPrompt?.trim()) body.custom_prompt = customPrompt.trim();
  if (musicUrl) body.music_url = musicUrl;
  else if (musicId) body.music_id = musicId;

  const overlay = overlayText?.trim();
  if (overlay) {
    body.overlay_text = overlay;
    body.overlay_position = overlayPosition === 'end' ? 'end' : 'whole';
    if (body.overlay_position === 'end') body.overlay_start_at = lengthSeconds - endOverlayDuration(lengthSeconds);
    if (overlayFont) body.overlay_font = overlayFont;
    if (overlayColor) body.overlay_color = overlayColor;
  }

  let res;
  try {
    res = await fetch(N8N_REEL_GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      mode: 'cors',
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new Error(data?.message || `Couldn’t start your reel (${res.status}). Please try again.`);
  }
  if (typeof data.job_id !== 'string' || !data.job_id) {
    throw new Error('The reel was submitted but no job id came back. Check your Library in a moment.');
  }
  return data.job_id;
}

// ── Storyboard reels ────────────────────────────────────────────────
// Step 1: analyse ONE hosted photo and get an editable, multi-scene script.
// Gemini reads the image server-side and returns premium jewellery scenes. This
// is synchronous (a few seconds) and does NOT create a job or charge credits.
export async function analyzeStoryboard({ imageUrl, lengthSeconds, ratio, resolution }) {
  if (!imageUrl) throw new Error('Add a photo first.');
  let res;
  try {
    res = await fetch(N8N_REEL_STORYBOARD, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, length_seconds: lengthSeconds, ratio, resolution }),
      credentials: 'omit',
      mode: 'cors',
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error || !Array.isArray(data.scenes) || !data.scenes.length) {
    throw new Error(data?.message || 'Couldn’t write a storyboard for that photo. Try another image.');
  }
  return {
    analysis: data.analysis || '',
    styleName: data.style_name || '',
    lengthSeconds: data.length_seconds ?? lengthSeconds,
    ratio: data.ratio ?? ratio,
    scenes: data.scenes.map((s, i) => ({
      order: s.order ?? i,
      title: s.title || `Scene ${i + 1}`,
      duration: s.duration ?? null,
      prompt: s.prompt || '',
      caption: s.caption || '',
    })),
  };
}

// Step 2: submit the user's EDITED scenes. Renders through the same pipeline as
// submitReel (Seedance clip per scene, all from the single photo), returns job_id.
export async function submitStoryboardReel({
  userId, imageUrl, scenes, lengthSeconds, ratio, resolution, styleName,
  customPrompt, musicId, musicUrl, overlayText, overlayPosition, overlayFont, overlayColor,
}) {
  if (!imageUrl) throw new Error('Add a photo for your reel.');
  if (!scenes?.length) throw new Error('Write a storyboard first.');
  const body = {
    user_id: userId,
    image_url: imageUrl,
    image1_url: imageUrl,               // back-compat with the shared plan node
    length_seconds: lengthSeconds,
    ratio,
    resolution,
    style_name: styleName || null,
    scenes: scenes.map((s, i) => ({
      order: s.order ?? i,
      duration: s.duration ?? null,
      prompt: (s.prompt || '').trim(),
      caption: (s.caption || '').trim(),
    })),
  };
  if (customPrompt?.trim()) body.custom_prompt = customPrompt.trim();
  if (musicUrl) body.music_url = musicUrl;
  else if (musicId) body.music_id = musicId;

  const overlay = overlayText?.trim();
  if (overlay) {
    body.overlay_text = overlay;
    body.overlay_position = overlayPosition === 'end' ? 'end' : 'whole';
    if (body.overlay_position === 'end') body.overlay_start_at = lengthSeconds - endOverlayDuration(lengthSeconds);
    if (overlayFont) body.overlay_font = overlayFont;
    if (overlayColor) body.overlay_color = overlayColor;
  }

  let res;
  try {
    res = await fetch(N8N_REEL_STORYBOARD_GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      mode: 'cors',
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new Error(data?.message || `Couldn’t start your reel (${res.status}). Please try again.`);
  }
  if (typeof data.job_id !== 'string' || !data.job_id) {
    throw new Error('The reel was submitted but no job id came back. Check your Library in a moment.');
  }
  return data.job_id;
}

export async function fetchReels() {
  const { data, error } = await db.from('reel_jobs').select(REEL_JOB_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapJob);
}

export async function fetchReel(jobId) {
  const { data, error } = await db.from('reel_jobs').select(REEL_JOB_COLUMNS).eq('id', jobId).maybeSingle();
  if (error) throw error;
  return data ? mapJob(data) : null;
}

export async function deleteReel(jobId) {
  const { error } = await db.from('reel_jobs').delete().eq('id', jobId);
  if (error) throw error;
}

export function subscribeToReel(jobId, onChange) {
  const topic = `reel_job:${jobId}`;
  for (const existing of db.getChannels()) {
    if (existing.topic === `realtime:${topic}`) db.removeChannel(existing);
  }
  const channel = db
    .channel(topic)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reel_jobs', filter: `id=eq.${jobId}` },
      (payload) => onChange(mapJob(payload.new)))
    .subscribe();
  return () => db.removeChannel(channel);
}

export async function fetchReelMusic() {
  try {
    const { data, error } = await db
      .from('reel_music')
      .select('music_id, name, mood, preview_url, duration_seconds')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      musicId: row.music_id, name: row.name, mood: row.mood ?? null,
      previewUrl: row.preview_url, durationSeconds: row.duration_seconds ?? null,
    }));
  } catch {
    return [];
  }
}

export function reelPosterUrl(outputUrl) {
  if (!outputUrl) return null;
  const marker = '/upload/';
  const idx = outputUrl.indexOf(marker);
  if (idx === -1) return null;
  const head = outputUrl.slice(0, idx + marker.length);
  const tail = outputUrl.slice(idx + marker.length);
  const jpgTail = tail.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
  if (jpgTail === tail) return null;
  return `${head}so_0/${jpgTail}`;
}
