import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from './env.js';

export function digestTokensMatch(received: string | undefined, expected: string): boolean {
  if (!received) return false;

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export const requireDigestToken: RequestHandler = (req, res, next) => {
  const token = req.header('X-Digest-Token');
  if (!digestTokensMatch(token, env.digestToken)) {
    res.status(401).json({ error: 'Token digest mancante o non valido' });
    return;
  }

  next();
};
