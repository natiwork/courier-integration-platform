import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the browser calls /api on the Vite server, which forwards it to the backend.
    // Same origin for the browser, so no CORS setup is needed.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
