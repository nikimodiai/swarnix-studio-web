import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Small manual chunking so the vendor libs split out from app code — keeps the
// first paint fast on the slow Indian 4G our jewellers are often on.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
