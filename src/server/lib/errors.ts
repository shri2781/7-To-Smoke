import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { EngineError } from '@shared/types.js';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'STALE_MATCH_NUMBER'
  | 'INVALID_PAIRING'
  | 'TOURNAMENT_COMPLETED'
  | 'TOURNAMENT_ABANDONED'
  | 'ACTIVE_TOURNAMENT_EXISTS'
  | 'DANCER_IN_USE'
  | 'NO_MATCHES_TO_UNDO'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL';

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;
  /** Attached by routes that want a 409 to carry the current state so the
   * client can self-heal instead of showing an error toast. */
  state?: unknown;

  constructor(status: number, code: ErrorCode, message: string, opts?: { details?: unknown; state?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = opts?.details;
    this.state = opts?.state;
  }
}

export function notFound(message = 'Not found'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, { details });
}

export function unauthorized(message = 'Unauthorized'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

// Express 5 forwards rejected promises from async handlers to next()
// automatically, but this wrapper keeps intent explicit and works
// regardless of Express version.
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as Req, res, next).catch(next);
  };
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Invalid request body.', details: err.flatten() },
    });
    return;
  }

  if (err instanceof EngineError) {
    // A corrupt-log condition the engine refused to replay. This should
    // only ever be reachable via a bug or manual DB tampering, so it's
    // logged loudly and reported as a 500, not surfaced as user error.
    // eslint-disable-next-line no-console
    console.error(`[${req.method} ${req.path}] EngineError(${err.code})`, err);
    res.status(500).json({
      error: { code: 'INTERNAL', message: 'The tournament log could not be replayed.' },
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      // eslint-disable-next-line no-console
      console.error(`[${req.method} ${req.path}]`, err);
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      ...(err.state !== undefined ? { state: err.state } : {}),
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`[${req.method} ${req.path}] unhandled error`, err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
}

/** Registered right before the SPA catch-all so an unknown /api/* path
 * returns JSON 404 instead of falling through to index.html — otherwise a
 * typo'd endpoint returns an HTML page that blows up on the client's
 * `res.json()` with a confusing parse error instead of a clean 404. */
export function jsonNotFound(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}
