import { createHash } from 'node:crypto';
import type { Timestamp } from 'firebase-admin/firestore';

export const MAX_DIGEST_ITEMS = 499;
export const DIGEST_RUN_LEASE_MS = 5 * 60 * 1000;
export const RESEND_IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000;

export type DigestRunStatus = 'in_progress' | 'failed' | 'sent' | 'completed';

export interface DigestRun {
  status: DigestRunStatus;
  settimana: string;
  itemIds: string[];
  idempotencyKey: string;
  itemsCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  leaseExpiresAt: Timestamp;
  attempts: number;
  resendEmailId?: string | null;
  lastError?: string;
  sentAt?: Timestamp;
  completedAt?: Timestamp;
}

export function createDigestIdempotencyKey(settimana: string, itemIds: string[]): string {
  const stableIds = [...itemIds].sort().join('|');
  const digest = createHash('sha256').update(stableIds).digest('hex');
  return `weekly-digest/${settimana}/${digest}`;
}

export function isRunRetrySafe(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs < RESEND_IDEMPOTENCY_SAFETY_WINDOW_MS;
}
