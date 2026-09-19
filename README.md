# 7 to Smoke

A king-of-the-hill dance battle tracker: 8+ dancers, first to a target score
wins, with a match cap as a safety valve. Full rewrite from a static,
memory-only page into a database-backed app with history, undo, and an
all-time leaderboard.

## Stack

- **Shared engine** (`src/shared/`) — pure TypeScript, zero dependencies.
  Replays a tournament's match log into the current bout, rotation queue,
  and ranked standings. Imported unchanged by both the server (authoritative)
  and the client (instant optimistic taps).
- **Server** (`src/server/`) — Express 5 + TypeScript, Prisma + PostgreSQL,
  talking to Neon through its serverless driver (`@prisma/adapter-neon`)
  rather than Prisma's own TCP connection pool. Single admin passcode
  behind a signed cookie gates every route.
- **Client** (`src/client/`) — React 19 + TypeScript + Vite, React Router,
  TanStack Query. CSS Modules on a shared token palette (the original
  fight-poster look).
- **Two deploy targets, same code**: Render runs one persistent Express
  process serving both the API and the built client (no CORS, one deploy,
  one URL). Vercel runs the same Express app as a serverless function
  (`api/index.ts`) alongside a statically-hosted client build. The Neon
  serverless driver is what makes the database access layer safe on both —
  a static connection pool sized for one long-running server is the wrong
  shape for a function that gets a fresh process per invocation.

## Local development

```bash
cp .env.example .env    # fill in DATABASE_URL, DIRECT_URL, ADMIN_PASSCODE, JWT_SECRET
npm install
npm run prisma:migrate  # creates tables from prisma/schema.prisma
npm run seed            # optional: a demo roster + one completed tournament
npm run dev             # vite (client, :5173) + express (server, :3001), proxied
```

Open http://localhost:5173.

## Database

Postgres, meant to run on [Neon](https://neon.tech)'s free tier. Neon gives
you **two** connection strings — grab both from its dashboard under
Connection Details:

- `DATABASE_URL` — the **pooled** one (contains `-pooler`), used at runtime
  by the Neon serverless driver (`src/server/db.ts`). The `pgbouncer=true` /
  `connection_limit=N` query params some Neon/Prisma guides mention are for
  tuning Prisma's *own* TCP connection pool — irrelevant here, since the
  driver adapter bypasses that pool entirely and manages connections itself
  over Neon's WebSocket proxy. Harmless to leave them in the string if
  Neon's dashboard already added them; nothing reads them.
- `DIRECT_URL` — the **direct** one (no `-pooler`), used only by
  `prisma migrate` (migrations don't go through the adapter).

Getting these backwards is the classic first mistake: migrations hang
forever through the pooled connection, or you see
`prepared statement "s0" already exists` at runtime from missing
`pgbouncer=true`.

## Testing

```bash
npm test          # engine property tests + unit tests (Vitest + fast-check)
npm run typecheck # tsc --noEmit for both client and server tsconfigs
```

The engine tests replay the exact scenario that crashed the original app
(hitting the match cap with nobody at the target score) and assert it now
ends cleanly.

## Deploying

Pick one — both are supported by the same codebase.

### Option A: Render + Neon (free tier)

The original target: one persistent Node process, simplest to reason about.
`render.yaml` is a ready-to-use Blueprint. Free tier means:

- Neon autosuspends after ~5 min idle — the first query after that takes
  1-2s (handled by a retry wrapper in `src/server/db.ts`).
- Render's free web service spins down after 15 min idle — a 30-50s cold
  start on the next request. Open the app a few minutes before an event, or
  upgrade the Render service to Starter ($7/mo) to remove this — no code
  change required, just flip the plan.

Build/deploy pipeline (already wired into `render.yaml`):

1. `npm ci && npx prisma generate && npm run build`
2. Pre-deploy: `npx prisma migrate deploy`
3. Start: `node dist/server/index.js`

Set `DATABASE_URL`, `DIRECT_URL`, and `ADMIN_PASSCODE` as environment
variables on the Render service; `JWT_SECRET` can be auto-generated.

### Option B: Vercel + Neon

Runs the same Express app as a serverless function instead of a persistent
process. `vercel.json` is already wired up:

- `api/index.ts` is the one serverless function — a thin re-export of
  `dist/server/vercelHandler.js`, which `tsup` pre-bundles (inlining
  `@shared/*`) during the build, same as the Render bundle but without the
  `app.listen()` call. Vercel invokes the exported Express app directly per
  request; it never binds a port itself.
- The build (`npm run vercel-build` → `prisma migrate deploy && npm run
  build`) produces both `dist/client` (served as static files, set as
  `outputDirectory`) and the two server bundles.
- `vercel.json`'s rewrites send `/api/(.*)` to the function and everything
  else to `index.html` (SPA fallback for client-side routes like
  `/game/:id`) — in that order, since Vercel evaluates rewrites top to
  bottom and the `/api` rule must win first.
- `src/server/app.ts` checks `process.env.VERCEL` (set automatically by
  Vercel at runtime) to skip Render's static-file-serving code path, since
  Vercel's CDN handles static assets before a request ever reaches the
  function.

Setup: `vercel link` (or connect the repo in the dashboard), then set
`DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSCODE`, and `JWT_SECRET` as
environment variables in the Vercel project settings (Production **and**
Preview, if you want preview deploys to work) — copy the values from your
own local `.env`, don't retype secrets into chat or commit messages.

Free-tier cold starts here come from two independent sources: Neon's own
autosuspend (same as Render) and Vercel's serverless function cold start
(typically faster than Render's free-tier sleep, since it's per-function
rather than a whole dormant service, but still non-zero on a function that
hasn't been invoked recently).

## Rules reference

The in-app **Rules** tab is the source of truth for the endgame and
tiebreak rules — read it there rather than in this file, since it's what
whoever is running an event will actually see.
