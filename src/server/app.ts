import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { prisma } from './db.js';
import { requireAuth } from './auth.js';
import { authRouter } from './routes/auth.js';
import { dancersRouter } from './routes/dancers.js';
import { tournamentsRouter } from './routes/tournaments.js';
import { statsRouter } from './routes/stats.js';
import { errorMiddleware, jsonNotFound } from './lib/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Builds the Express app without binding a port — imported by both
 * index.ts (which listens) and the supertest integration suite (which
 * doesn't need a real socket). */
export function createApp() {
  const app = express();

  // Render terminates TLS at its proxy in front of this process. Without
  // this, `secure` cookies can silently fail to be set, and
  // express-rate-limit keys every request to the same upstream IP instead
  // of the real client.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());

  // Unauthenticated — also warms a suspended Neon instance so the login
  // screen can fire this on mount while the operator is typing the passcode.
  app.get('/healthz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', authRouter);

  // Everything else under /api requires the admin passcode.
  app.use('/api/dancers', requireAuth, dancersRouter);
  app.use('/api/tournaments', requireAuth, tournamentsRouter);
  app.use('/api/stats', requireAuth, statsRouter);

  // A typo'd /api/* path should 404 as JSON, not fall through to index.html
  // and blow up the client's res.json() with a confusing parse error.
  app.use('/api', jsonNotFound);

  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.resolve(__dirname, '../client');
    app.use(express.static(clientDist));
    // Express 5's wildcard syntax changed from '*' to a named splat param.
    app.get('/*splat', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorMiddleware);

  return app;
}
