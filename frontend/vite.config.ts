import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the browser calls /api on the Vite server, which forwards it to the backend.
    // Same origin for the browser, so no CORS setup is needed.
    // API_PROXY_TARGET lets the e2e tests point it at their own backend (e2e/playwright.config.ts).
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
});
