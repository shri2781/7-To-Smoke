import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  outDir: 'dist/server',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  tsconfig: 'tsconfig.server.json',
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // esbuild resolves the @shared/* alias via tsconfig "paths" and inlines
  // it directly — this is what avoids the classic "tsc emit leaves the
  // bare alias in the output JS and Node can't resolve it at runtime" trap.
  // The generated Prisma client stays external: it's resolved from
  // node_modules at runtime, not bundled.
  external: ['@prisma/client'],
});
