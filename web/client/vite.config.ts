import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const target = env.MDHUB_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: false },
      '/ws': { target, ws: true, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
