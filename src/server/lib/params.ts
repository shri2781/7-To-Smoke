import type { Request } from 'express';
import { badRequest } from './errors.js';

/** Express 5's param typings allow `string | string[]` (repeated/splat
 * segments can produce arrays); every route here uses single named
 * params, so this narrows and fails loudly if that assumption is ever
 * violated instead of silently mis-typing an id. */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest(`Missing or invalid path parameter "${name}".`);
  }
  return value;
}
