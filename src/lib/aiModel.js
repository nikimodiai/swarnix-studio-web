// ── AI Model generation — shared runner ──────────────────────────────
// Extracted out of AIModelPanel.jsx so Batch Studio can call the SAME n8n
// workflow (swarnix-ai-model) instead of duplicating the multipart-body /
// response-parsing logic. Single source of truth for what the workflow expects
// and how its response is read.

import { N8N_AI_MODEL, CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from './config';

// Map jewelry category → jewelry type label sent to the n8n workflow.
export const CATEGORY_TO_JEWELRY_TYPE = {
  Earring:       'earrings',
  Necklace:      'necklace',
  Pendant:       'necklace',
  Mangalsutra:   'mangalsutra',
  Chain:         'necklace',
  Ring:          'ring',
  Bangle:        'bangles',
  Bracelet:      'bracelet',
  Anklet:        'anklet',
  Nosepin:       'nose_pin',
  'Maang Tikka': 'maang_tikka',
  Bajuband:      'armlet',
  Kamarband:     'waist_chain',
  'Haath Phool': 'bracelet',
  Bichhiya:      'anklet',
  Set:           'necklace',
};

export function jewelryTypeForCategory(category) {
  return CATEGORY_TO_JEWELRY_TYPE[category] || 'jewellery';
}

// Defaults for every tuning field the workflow accepts. Batch Studio exposes
// only the handful that matter for keeping a collection's model consistent
// (occasion, gender, skin tone, framing) and leaves the rest at these — the
// single AI Model screen still exposes the full picker set.
export const AI_MODEL_DEFAULTS = {
  occasion: 'festive',
  model_gender: 'female',
  skin_tone: 'auto',
  framing: 'half_face',
  pose: 'auto',
  attire: 'auto',
  attire_color: 'neutral',
  background: 'studio_white',
  aspect: '1:1',
  lighting: 'clean',
  custom_note: '',
};

async function uploadBlobToCloudinary(blob, filename) {
  const fd = new FormData();
  fd.append('file', blob, filename);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'swarnix-ai-model');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  return (await res.json()).secure_url;
}

/**
 * Run one AI Model generation. `source` is a File/Blob OR an already-hosted
 * image url (batch pieces are uploaded ahead of time, so they pass a url and
 * we fetch+re-wrap it as a blob for the multipart body).
 *
 * `modelReferenceUrl` is the collection's locked model, if any — see
 * MODEL_REFERENCE_NOTE in BatchStudio.jsx for the caveat on whether n8n
 * currently reads it.
 */
export async function runAiModel({ ownerId, source, category, sel, modelReferenceUrl }) {
  let fileBlob = source;
  if (typeof source === 'string') {
    const r = await fetch(source);
    if (!r.ok) throw new Error('Could not load the source photo');
    fileBlob = await r.blob();
  }

  const opts = { ...AI_MODEL_DEFAULTS, ...sel };
  const fd = new FormData();
  fd.append('image', fileBlob, 'source.jpg');
  fd.append('owner_id', ownerId);
  fd.append('jewelry_type', jewelryTypeForCategory(category));
  fd.append('source', 'web');
  fd.append('occasion', opts.occasion);
  fd.append('model_gender', opts.model_gender);
  fd.append('skin_tone', opts.skin_tone);
  fd.append('framing', opts.framing);
  fd.append('pose', opts.pose);
  fd.append('attire', opts.attire);
  fd.append('attire_color', opts.attire_color);
  fd.append('background', opts.background);
  if (opts.background === 'brand' && opts.brand_color) fd.append('brand_color', opts.brand_color);
  fd.append('aspect_ratio', opts.aspect);
  fd.append('lighting', opts.lighting);
  if (opts.custom_note?.trim()) fd.append('custom_note', opts.custom_note.trim().slice(0, 300));
  // Collection model lock (P1-2) — see MODEL_REFERENCE_NOTE.
  if (modelReferenceUrl) fd.append('model_reference_url', modelReferenceUrl);

  const res = await fetch(N8N_AI_MODEL, { method: 'POST', body: fd, credentials: 'omit', mode: 'cors' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Generation failed (${res.status})${text ? ': ' + text.slice(0, 120) : ''}`);
  }
  const data = await res.json();
  if (data?.result_url)      return data.result_url;
  if (data?.secure_url)      return data.secure_url;
  if (data?.[0]?.result_url) return data[0].result_url;
  if (data?.data?.[0]?.b64_json) {
    const b64 = data.data[0].b64_json;
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/jpeg' });
    return uploadBlobToCloudinary(blob, `ai_model_${ownerId}_${Date.now()}.jpg`);
  }
  throw new Error('No image URL in response. Check n8n workflow output.');
}
