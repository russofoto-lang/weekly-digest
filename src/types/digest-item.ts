import type { Timestamp } from 'firebase-admin/firestore';
import type { DigestTag } from '../lib/digest-tags.js';

export const DIGEST_ITEM_TYPES = ['articolo', 'youtube'] as const;
export const DIGEST_ITEM_STATUSES = ['pending', 'archiviato'] as const;

export type DigestItemType = (typeof DIGEST_ITEM_TYPES)[number];
export type DigestItemStatus = (typeof DIGEST_ITEM_STATUSES)[number];

export interface DigestItem {
  id: string;
  url: string;
  tipo: DigestItemType;
  titolo: string;
  descrizione: string;
  thumbnail: string;
  testoLeggibile: string | null;
  durata: string | null;
  dataAggiunta: Timestamp;
  stato: DigestItemStatus;
  settimana: string;
  preferito?: true;
  tags?: DigestTag[];
  tagsManual?: true;
  troncato?: true;
  titoloTradotto?: string;
  testoTradotto?: string;
  linguaTraduzione?: 'it';
  dataTraduzione?: Timestamp;
}

export type CreateDigestItemInput = Pick<DigestItem, 'url'>;

export type CreateManualDigestItemInput = Pick<
  DigestItem,
  'url' | 'titolo' | 'descrizione' | 'thumbnail'
>;

export type UpdateDigestItemInput = CreateManualDigestItemInput & { tags: DigestTag[] };

export type CapturedDigestItem = Pick<
  DigestItem,
  | 'url'
  | 'tipo'
  | 'titolo'
  | 'descrizione'
  | 'thumbnail'
  | 'testoLeggibile'
  | 'durata'
  | 'troncato'
>;
