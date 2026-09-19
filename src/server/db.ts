import { PrismaClient } from '@prisma/client';

// A single shared client for the process. In dev with tsx --watch this
// module can re-evaluate on file changes; stash it on globalThis so a hot
// reload doesn't leak Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Neon's free tier autosuspends after ~5 min idle; the first query after
 * that can take 1-2s or fail outright with P1001/P1017. Wrap any query run
 * right after a likely-cold start with this. */
export async function withColdStartRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'P1001' || code === 'P1017') {
      await new Promise((r) => setTimeout(r, 750));
      return fn();
    }
    throw err;
  }
}
