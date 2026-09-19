// Vercel serverless entry point. Deliberately does NOT call app.listen() —
// Vercel's Node runtime invokes the exported Express app directly as a
// (req, res) handler per invocation. This file (and everything it
// transitively imports, including @shared/*) is pre-bundled by tsup into
// a single plain-JS file with no unresolved path aliases, and api/index.ts
// just re-exports that bundle — rather than relying on Vercel's own
// per-function bundler to understand this project's tsconfig "paths",
// which is a more uncertain thing to get right without being able to
// deploy-and-check from here.
import { createApp } from './app.js';

const app = createApp();

export default app;
