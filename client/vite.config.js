import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: '../server/dist',
    emptyOutDir: true,
    rollupOptions: {
      // Three.js loads at runtime via CDN importmap (see index.html) — don't bundle it
      external: ['three'],
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
