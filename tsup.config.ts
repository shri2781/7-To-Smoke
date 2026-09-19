import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries sharing one config: `index` is Render's persistent-server
  // process (calls app.listen()); `vercelHandler` is the same Express app
  // exported for Vercel's serverless runtime (no listen() call). Object
  // form controls the output filenames (dist/server/index.js,
  // dist/server/vercelHandler.js) rather than deriving them from path.
  entry: {
    index: 'src/server/index.ts',
    vercelHandler: 'src/server/vercelHandler.ts',
  },
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
  // Native/binary-adjacent packages stay external, resolved from
  // node_modules at runtime instead of bundled.
  external: ['@prisma/client', '@neondatabase/serverless', '@prisma/adapter-neon', 'ws'],
});
