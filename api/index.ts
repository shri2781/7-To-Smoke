// Vercel discovers serverless functions by file path under /api. This one
// is deliberately trivial — the actual Express app (and everything it
// imports, including the @shared/* path alias) is pre-bundled by tsup
// during the build step into dist/server/vercelHandler.js, a plain JS
// file with no aliases left to resolve. Referencing that here means
// Vercel's own per-function bundler only ever has one plain relative
// import to trace, regardless of how well it understands this project's
// tsconfig path aliases.
export { default } from '../dist/server/vercelHandler.js';
