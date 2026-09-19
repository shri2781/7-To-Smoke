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
- **Server** (`src/server/`) — Express 5 + TypeScript, Prisma + PostgreSQL.
  Single admin passcode behind a signed cookie gates every route.
- **Client** (`src/client/`) — React 19 + TypeScript + Vite, React Router,
  TanStack Query. CSS Modules on a shared token palette (the original
  fight-poster look).
- One Express service serves both the API and the built client — no CORS,
  one deploy, one URL.

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

- `DATABASE_URL` — the **pooled** one (contains `-pooler`), used at runtime.
  Append `&pgbouncer=true&connection_limit=5` if Neon's UI didn't already.
  (`connection_limit=1` is the commonly-cited advice, but that's for
  serverless functions where each invocation is its own process holding one
  connection. This app is one long-running server — `1` means any two
  concurrent requests fight over the same connection, and a request that
  opens a transaction (recording a match) will make every other request
  queue behind it until Prisma's transaction-acquire timeout fails it with
  a P2028. Confirmed by the API integration tests' concurrent-submission
  case failing with a 500 instead of the expected 409 at `connection_limit=1`.)
- `DIRECT_URL` — the **direct** one (no `-pooler`), used only by
  `prisma migrate`.

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

## Deploying (Render + Neon, free tier)

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

## Rules reference

The in-app **Rules** tab is the source of truth for the endgame and
tiebreak rules — read it there rather than in this file, since it's what
whoever is running an event will actually see.
