import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The API integration suite makes real network round trips to Neon;
    // the pure engine tests don't need this but it's harmless for them.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
