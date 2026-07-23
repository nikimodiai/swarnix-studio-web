import { createClient } from '@supabase/supabase-js';

// ── Env-driven config (Vite reads VITE_* at build time) ─────────────
// Falls back to the shared Swarnix defaults so local dev works out of the box;
// in production set VITE_* in Vercel. This site shares the Swarnix Supabase
// project + n8n instance with the mobile swarnix-studio app, and lives in the
// same app_* tables (user_id === auth.uid()). The anon key is public and safe
// in the browser ONLY because every app_* table has RLS keyed to auth.uid().
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL || 'https://bigmdvjrvqyqzyrijdum.supabase.co';

export const SUPABASE_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZ21kdmpydnF5cXp5cmlqZHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDU0OTcsImV4cCI6MjA5Mzk4MTQ5N30.8WWSA8xC0ySHhAgz9pscBvI5O2r6-LSejuy-mnyzRdM';

export const CLOUDINARY_CLOUD = env.VITE_CLOUDINARY_CLOUD || 'jewelleryinventory';
export const CLOUDINARY_PRESET = env.VITE_CLOUDINARY_PRESET || 'jewelleryupload';

// Per-upload size cap for device photos.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── n8n webhooks (shared with the mobile studio + Swarnix web) ──────
// The Studio Suite features reuse the SAME proven n8n workflows. All take the
// signed-in user's Supabase id (owner_id === user.id) for the workflow's usage
// log only; credits are enforced app-side via the app_reserve/refund RPCs.
export const N8N_BASE = env.VITE_N8N_BASE || 'https://n8n.srv1639765.hstgr.cloud/webhook';

// AI Model (image-to-model). Multipart { image, owner_id, jewelry_type, source,
// + tuning fields } → { result_url }.
export const N8N_AI_MODEL = N8N_BASE + '/swarnix-ai-model';

// Jewellery Design generation (v2 Design Pack). Multipart { owner_id, prompt,
// mode, variation, reference? } → { renders: [url] }.
export const N8N_DESIGN_GENERATE = N8N_BASE + '/swarnix-design-generate-v2';

// Studio Photo (retouch) + Metal Swap (variant): one workflow, two modes
// (`mode: 'retouch' | 'variant'`). JSON { owner_id, image_url, mode, style,
// target_metal? } → { success, retouched_url }.
export const N8N_RETOUCH = N8N_BASE + '/retouch';

// Reel Generation (image-to-video). reel-generate: JSON submit → { job_id }; the
// render runs in the background and n8n's service role updates the reel_jobs row.
export const N8N_REEL_GENERATE = N8N_BASE + '/reel-generate';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'swarnix-studio-web-auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// ── Product categories (for the AI Model type picker) ───────────────
// Trimmed to the categories the AI Model feature actually maps to a jewelry_type.
export const CATEGORIES = [
  { value: 'Ring', label: 'Rings' },
  { value: 'Earring', label: 'Earrings' },
  { value: 'Necklace', label: 'Necklaces' },
  { value: 'Bangle', label: 'Bangles' },
  { value: 'Bracelet', label: 'Bracelets' },
  { value: 'Pendant', label: 'Pendants' },
  { value: 'Mangalsutra', label: 'Mangalsutra' },
  { value: 'Chain', label: 'Chains' },
  { value: 'Anklet', label: 'Anklets' },
  { value: 'Nosepin', label: 'Nosepins' },
  { value: 'Maang Tikka', label: 'Maang Tikka' },
  { value: 'Bajuband', label: 'Bajuband (Armlets)' },
  { value: 'Kamarband', label: 'Kamarband (Waist Belt)' },
  { value: 'Haath Phool', label: 'Haath Phool' },
  { value: 'Bichhiya', label: 'Bichhiya (Toe Rings)' },
  { value: 'Set', label: 'Sets' },
];
