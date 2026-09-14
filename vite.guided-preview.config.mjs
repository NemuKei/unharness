import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { thirdPartyNotices } from './scripts/license-notices.mjs';

// A separate static entry: no configuration controller or public connection.
export default defineConfig({
  root: 'prototype',
  plugins: [react(), thirdPartyNotices()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { outDir: '../local-evidence/guided-preview-build', emptyOutDir: true },
});
