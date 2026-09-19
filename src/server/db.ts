import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Node has no native WebSocket implementation the Neon serverless driver
// can use by default (some newer Node versions do, but this polyfill is
// harmless either way) — required for the driver's WS-pooled connection
// mode, which is what supports interactive transactions (prisma.$transaction).
// The plain HTTP-fetch mode the driver also offers is single-query-only.
neonConfig.webSocketConstructor = ws;

// A driver adapter (talking to Neon over the driver's own WebSocket pool)
// instead of Prisma's built-in TCP connection pool. This is what makes the
// client safe to construct fresh inside a Vercel serverless function
// invocation — a static TCP pool sized for one persistent process is the
// wrong shape there. Works identically on a persistent server (Render);
// there's no reason to branch this per deploy target.
function createAdapter() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new PrismaNeon({ connectionString });
}

// Neon's pooled connections get recycled — idle ones are closed from the
// server side, and the free tier also autosuspends after ~5 min idle.
// Either shows up as a P1001 ("can't reach database") or P1017 ("server
// has closed the connection") — both transient, both worth one quiet
// retry rather than a 500 on the next request that happens to land on a
// since-closed connection.
const RETRYABLE_CODES = new Set(['P1001', 'P1017']);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

function isRetryable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE_CODES.has(err.code);
}

function createClient() {
  return new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends({
    name: 'retry-transient-connection-errors',
    query: {
      async $allOperations({ query, args }) {
        let lastErr: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            lastErr = err;
            if (!isRetryable(err) || attempt === MAX_ATTEMPTS) throw err;
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
          }
        }
        throw lastErr;
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

// A single shared client per process. In dev with tsx --watch this module
// can re-evaluate on file changes; stash it on globalThis so a hot reload
// doesn't leak connections. On Vercel, each serverless invocation gets its
// own module scope (no shared globalThis across invocations), so this is
// purely a dev convenience there, not a cross-invocation cache — correct
// either way.
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * The `$allOperations` retry above covers ordinary reads/writes, but it
 * can't safely resume an *interactive transaction* (`prisma.$transaction`)
 * whose connection died partway through — Postgres has already rolled
 * that transaction back by the time the error surfaces. Wrap the whole
 * `$transaction(...)` call with this instead, so a connection reset
 * retries the entire transaction from scratch exactly once. Safe to
 * retry: nothing inside it depends on wall-clock time, and a
 * connection-reset transaction never partially commits.
 */
export async function withTransactionRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    return fn();
  }
}
