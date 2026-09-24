import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from './env.js';
import type { DigestItem } from '../types/digest-item.js';

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: env.firebaseProjectId,
  });
}

export const db = getFirestore();
export const digestItemsCollection = db.collection(
  'digest_items',
) as FirebaseFirestore.CollectionReference<DigestItem>;
