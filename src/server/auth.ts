import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { unauthorized } from './lib/errors.js';

export const SESSION_COOKIE = 'sts_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h — events run all day; no re-login mid-battle

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function adminPasscode(): string {
  const passcode = process.env.ADMIN_PASSCODE;
  if (!passcode) throw new Error('ADMIN_PASSCODE is not set');
  return passcode;
}

/** A short hash of the current passcode, embedded in every issued token.
 * Rotating ADMIN_PASSCODE changes this hash, which invalidates every
 * session signed under the old one — without needing a server-side
 * session store or token blocklist. */
function passcodeFingerprint(): string {
  return crypto.createHash('sha256').update(adminPasscode()).digest('hex').slice(0, 16);
}

/** Constant-time compare so a login attempt can't be brute-forced faster
 * by timing how many leading characters matched. */
export function passcodeMatches(candidate: string): boolean {
  const expected = Buffer.from(adminPasscode());
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length) {
    // Still do a same-cost comparison so the length itself leaks less.
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

export function issueSessionCookie(res: Response) {
  const token = jwt.sign({ fp: passcodeFingerprint() }, jwtSecret(), { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function verify(token: string): boolean {
  try {
    const payload = jwt.verify(token, jwtSecret()) as { fp?: string };
    return payload.fp === passcodeFingerprint();
  } catch {
    return false;
  }
}

export function isAuthed(req: Request): boolean {
  const token = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && verify(token);
}

/** Gates every route except /api/auth/* and /healthz. Also slides the
 * session: a valid request re-issues the cookie with a fresh 12h window,
 * so a busy operator is never logged out mid-event. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isAuthed(req)) {
    return next(unauthorized('Enter the admin passcode to continue.'));
  }
  issueSessionCookie(res);
  next();
}
