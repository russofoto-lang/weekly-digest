import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { requireDigestToken } from '../lib/digest-auth.js';
import { buildDigestEmailHtml } from '../lib/digest-email.js';
import {
  DIGEST_RUN_LEASE_MS,
  MAX_DIGEST_ITEMS,
  createDigestIdempotencyKey,
  isRunRetrySafe,
  type DigestRun,
} from '../lib/digest-run.js';
import { env } from '../lib/env.js';
import { db, digestItemsCollection } from '../lib/firestore.js';
import { getIsoWeek } from '../lib/iso-week.js';
import { ResendError, sendDigestEmail } from '../lib/resend.js';
import type { DigestItem } from '../types/digest-item.js';

export const generaDigestRouter = Router();

type RunAction =
  | { kind: 'send'; run: DigestRun }
  | { kind: 'archive'; run: DigestRun }
  | { kind: 'skip'; reason: 'already sent' | 'digest in progress' }
  | { kind: 'blocked' }
  | { kind: 'too_many'; count: number };

function runCollection() {
  return db.collection('digest_runs') as FirebaseFirestore.CollectionReference<DigestRun>;
}

function requireValidRun(data: DigestRun | undefined): DigestRun {
  if (
    !data
    || !Array.isArray(data.itemIds)
    || data.itemIds.some((id) => typeof id !== 'string')
    || typeof data.idempotencyKey !== 'string'
  ) {
    throw new Error('Documento digest_run non valido');
  }
  return data;
}

async function loadRunItems(itemIds: string[]): Promise<DigestItem[]> {
  const references = itemIds.map((id) => digestItemsCollection.doc(id));
  const snapshots = await db.getAll(...references);
  const missingIds = snapshots.filter((snapshot) => !snapshot.exists).map((snapshot) => snapshot.id);

  if (missingIds.length > 0) {
    const error = new Error(`Item del digest non trovati: ${missingIds.join(', ')}`);
    Object.assign(error, { status: 409 });
    throw error;
  }

  return snapshots.map((snapshot) => ({
    ...(snapshot.data() as DigestItem),
    id: snapshot.id,
  }));
}

async function archiveRun(run: DigestRun): Promise<void> {
  const runRef = runCollection().doc(run.settimana);
  const itemRefs = run.itemIds.map((id) => digestItemsCollection.doc(id));

  await db.runTransaction(async (transaction) => {
    const currentRunSnapshot = await transaction.get(runRef);
    const currentRun = requireValidRun(currentRunSnapshot.data());
    if (currentRun.status === 'completed') return;
    if (currentRun.status !== 'sent') {
      throw new Error(`Impossibile archiviare un digest in stato ${currentRun.status}`);
    }

    const itemSnapshots = await transaction.getAll(...itemRefs);
    for (const itemSnapshot of itemSnapshots) {
      if (itemSnapshot.exists && itemSnapshot.data()?.stato === 'pending') {
        transaction.update(itemSnapshot.ref, { stato: 'archiviato' });
      }
    }

    const now = Timestamp.now();
    transaction.update(runRef, {
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    });
  });
}

generaDigestRouter.post('/', requireDigestToken, async (_req, res, next) => {
  try {
    const settimana = getIsoWeek();
    const pendingSnapshot = await digestItemsCollection
      .where('stato', '==', 'pending')
      .orderBy('dataAggiunta', 'asc')
      .get();

    if (pendingSnapshot.empty) {
      res.status(200).json({ skipped: true, reason: 'no pending items' });
      return;
    }

    const runRef = runCollection().doc(settimana);
    const action = await db.runTransaction<RunAction>(async (transaction) => {
      const now = Timestamp.now();
      const runSnapshot = await transaction.get(runRef);

      if (runSnapshot.exists) {
        const run = requireValidRun(runSnapshot.data());
        if (run.status === 'completed') return { kind: 'skip', reason: 'already sent' };
        if (run.status === 'sent') return { kind: 'archive', run };

        if (!isRunRetrySafe(run.createdAt.toMillis(), now.toMillis())) {
          return { kind: 'blocked' };
        }

        if (run.status === 'in_progress' && run.leaseExpiresAt.toMillis() > now.toMillis()) {
          return { kind: 'skip', reason: 'digest in progress' };
        }

        const resumedRun: DigestRun = {
          ...run,
          status: 'in_progress',
          attempts: run.attempts + 1,
          updatedAt: now,
          leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + DIGEST_RUN_LEASE_MS),
        };
        transaction.set(runRef, resumedRun);
        return { kind: 'send', run: resumedRun };
      }

      if (pendingSnapshot.docs.length > MAX_DIGEST_ITEMS) {
        return { kind: 'too_many', count: pendingSnapshot.docs.length };
      }

      const itemIds = pendingSnapshot.docs.map((document) => document.id);
      const run: DigestRun = {
        status: 'in_progress',
        settimana,
        itemIds,
        idempotencyKey: createDigestIdempotencyKey(settimana, itemIds),
        itemsCount: itemIds.length,
        createdAt: now,
        updatedAt: now,
        leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + DIGEST_RUN_LEASE_MS),
        attempts: 1,
      };
      transaction.create(runRef, run);
      return { kind: 'send', run };
    });

    if (action.kind === 'skip') {
      res.status(200).json({ skipped: true, reason: action.reason, settimana });
      return;
    }

    if (action.kind === 'blocked') {
      console.error(`[digest ${settimana}] stato di invio ambiguo oltre la finestra di idempotenza`);
      res.status(409).json({
        sent: false,
        error: 'Stato del precedente invio ambiguo: verifica il run prima di riprovare',
      });
      return;
    }

    if (action.kind === 'too_many') {
      console.error(`Troppi item pending: ${action.count} (max ${MAX_DIGEST_ITEMS})`);
      res.status(422).json({
        sent: false,
        error: `Troppi item in coda: massimo ${MAX_DIGEST_ITEMS} per digest`,
      });
      return;
    }

    if (action.kind === 'archive') {
      await archiveRun(action.run);
      res.status(200).json({
        sent: true,
        count: action.run.itemsCount,
        settimana,
        resumed: true,
      });
      return;
    }

    const items = await loadRunItems(action.run.itemIds);
    const html = buildDigestEmailHtml({ items, baseUrl: env.baseUrl });
    const subject = `Digest settimanale · ${settimana}`;

    try {
      const receipt = await sendDigestEmail(subject, html, action.run.idempotencyKey);
      const now = Timestamp.now();
      await runRef.update({
        status: 'sent',
        resendEmailId: receipt.id,
        sentAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (error instanceof ResendError) {
        console.error(error.message);
        try {
          await runRef.update({
            status: 'failed',
            lastError: error.message.slice(0, 500),
            updatedAt: Timestamp.now(),
          });
        } catch (stateError) {
          console.error('[digest run state error]', stateError);
        }
        res.status(502).json({ sent: false, error: error.message });
        return;
      }
      throw error;
    }

    await archiveRun({ ...action.run, status: 'sent' });
    res.status(200).json({ sent: true, count: items.length, settimana });
  } catch (error) {
    next(error);
  }
});
