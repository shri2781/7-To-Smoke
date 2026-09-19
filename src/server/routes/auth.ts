import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema } from '@shared/schemas.js';
import { asyncHandler, unauthorized } from '../lib/errors.js';
import { clearSessionCookie, isAuthed, issueSessionCookie, passcodeMatches } from '../auth.js';

export const authRouter = Router();

// The login endpoint is the app's only unauthenticated public surface —
// throttle it hard. Keyed by IP; requires `trust proxy` to be set on the
// app (see index.ts) or every request behind Render's proxy shares one key.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' } },
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    if (!passcodeMatches(body.passcode)) {
      throw unauthorized('Incorrect passcode.');
    }
    issueSessionCookie(res);
    res.status(204).end();
  }),
);

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ authed: false });
    return;
  }
  res.json({ authed: true });
});
