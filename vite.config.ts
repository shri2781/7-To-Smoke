import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  publicDir: path.resolve(__dirname, 'src/client/public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Anchored regex, not a bare '/api' string key: Vite/http-proxy-
      // middleware matches a plain string key by naive prefix, so '/api'
      // would ALSO match a client source path like '/apiClient/...' or
      // anything else starting with those four letters, silently
      // hijacking it to the backend and 404ing. This matches only real
      // "/api" or "/api/..." request paths.
      '^/api($|/)': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});
