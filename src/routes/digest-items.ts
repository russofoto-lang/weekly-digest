import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { captureContent, ContentCaptureError, normalizeUrl } from '../lib/capture-content.js';
import { requireDigestToken } from '../lib/digest-auth.js';
import { classifyDigestTags, parseDigestTags } from '../lib/digest-tags.js';
import { digestItemsCollection } from '../lib/firestore.js';
import { getIsoWeek } from '../lib/iso-week.js';
import { ArticleTranslationError, translateArticleToItalian } from '../lib/translate-article.js';
import type {
  CreateDigestItemInput,
  CreateManualDigestItemInput,
  DigestItem,
  UpdateDigestItemInput,
} from '../types/digest-item.js';

export const digestItemsRouter = Router();

class ValidationError extends Error {}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseInput(body: unknown): CreateDigestItemInput {
  if (!body || typeof body !== 'object') throw new ValidationError('Body JSON non valido');
  const input = body as Record<string, unknown>;

  if (!nonEmptyString(input.url)) throw new ValidationError('url e obbligatorio');
  return { url: input.url.trim() };
}

function optionalString(value: unknown, field: string, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${field} non valido`);
  const result = value.trim();
  if (result.length > maxLength) throw new ValidationError(`${field} troppo lungo`);
  return result;
}

function parseManualInput(body: unknown): CreateManualDigestItemInput {
  if (!body || typeof body !== 'object') throw new ValidationError('Body JSON non valido');
  const input = body as Record<string, unknown>;
  if (!nonEmptyString(input.url)) throw new ValidationError('url e obbligatorio');
  if (!nonEmptyString(input.titolo)) throw new ValidationError('titolo e obbligatorio');

  const titolo = input.titolo.trim();
  if (titolo.length > 500) throw new ValidationError('titolo troppo lungo');
  const thumbnail = optionalString(input.thumbnail, 'thumbnail', 2_000);
  if (thumbnail) {
    let thumbnailUrl: URL;
    try {
      thumbnailUrl = new URL(thumbnail);
    } catch {
      throw new ValidationError('thumbnail deve essere un URL valido');
    }
    if (!['http:', 'https:'].includes(thumbnailUrl.protocol)) {
      throw new ValidationError('thumbnail deve essere un URL HTTP o HTTPS');
    }
  }

  return {
    url: input.url.trim(),
    titolo,
    descrizione: optionalString(input.descrizione, 'descrizione', 5_000),
    thumbnail,
  };
}

function parseUpdateInput(body: unknown): UpdateDigestItemInput {
  const input = parseManualInput(body);
  const tagsValue = (body as Record<string, unknown>).tags;
  try {
    return {
      ...input,
      tags: tagsValue === undefined
        ? classifyDigestTags(input.titolo, input.descrizione)
        : parseDigestTags(tagsValue),
    };
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : 'Categorie non valide');
  }
}

function optionalPersonalNote(value: unknown): string {
  return optionalString(value, 'nota personale', 1_000);
}

digestItemsRouter.get('/', async (req, res, next) => {
  try {
    const settimana = nonEmptyString(req.query.settimana)
      ? req.query.settimana.trim()
      : getIsoWeek();
    const snapshot = await digestItemsCollection
      .where('settimana', '==', settimana)
      .orderBy('dataAggiunta', 'desc')
      .get();

    res.json(snapshot.docs.map((document) => document.data()));
  } catch (error) {
    next(error);
  }
});

digestItemsRouter.post('/', requireDigestToken, async (req, res, next) => {
  try {
    const input = parseInput(req.body);
    const normalizedUrl = normalizeUrl(input.url);
    const existingSnapshot = await digestItemsCollection
      .where('url', '==', normalizedUrl)
      .where('stato', '==', 'pending')
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      const existingDocument = existingSnapshot.docs[0];
      if (!existingDocument) throw new Error('Documento duplicato non disponibile');

      const dataAggiunta = Timestamp.now();
      const captured = await captureContent(normalizedUrl);
      const existing = existingDocument.data();
      const updates = {
        ...captured,
        tags: existing.tagsManual ? existing.tags : classifyDigestTags(captured.titolo, captured.descrizione),
        dataAggiunta,
      };
      await existingDocument.ref.update(updates);
      res.status(200).json({
        duplicate: true,
        item: { ...existingDocument.data(), ...updates },
      });
      return;
    }

    const captured = await captureContent(normalizedUrl);
    const document = digestItemsCollection.doc();
    const item: DigestItem = {
      id: document.id,
      ...captured,
      tags: classifyDigestTags(captured.titolo, captured.descrizione),
      dataAggiunta: Timestamp.now(),
      stato: 'pending',
      settimana: getIsoWeek(),
    };

    await document.create(item);
    res.status(201).json(item);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof ContentCaptureError) {
      res.status(422).json({ error: error.message });
      return;
    }
    next(error);
  }
});

digestItemsRouter.post('/manuale', requireDigestToken, async (req, res, next) => {
  try {
    const input = parseManualInput(req.body);
    const normalizedUrl = normalizeUrl(input.url);
    const existingSnapshot = await digestItemsCollection
      .where('url', '==', normalizedUrl)
      .where('stato', '==', 'pending')
      .limit(1)
      .get();
    const dataAggiunta = Timestamp.now();

    if (!existingSnapshot.empty) {
      const existingDocument = existingSnapshot.docs[0];
      if (!existingDocument) throw new Error('Documento duplicato non disponibile');
      const updates = {
        titolo: input.titolo,
        descrizione: input.descrizione,
        tags: existingDocument.data().tagsManual
          ? existingDocument.data().tags
          : classifyDigestTags(input.titolo, input.descrizione),
        thumbnail: input.thumbnail,
        testoLeggibile: null,
        durata: null,
        dataAggiunta,
      };
      await existingDocument.ref.update(updates);
      res.status(200).json({
        duplicate: true,
        item: { ...existingDocument.data(), ...updates },
      });
      return;
    }

    const document = digestItemsCollection.doc();
    const item: DigestItem = {
      id: document.id,
      url: normalizedUrl,
      tipo: 'articolo',
      titolo: input.titolo,
      descrizione: input.descrizione,
      tags: classifyDigestTags(input.titolo, input.descrizione),
      thumbnail: input.thumbnail,
      testoLeggibile: null,
      durata: null,
      dataAggiunta,
      stato: 'pending',
      settimana: getIsoWeek(),
    };
    await document.create(item);
    res.status(201).json(item);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof ContentCaptureError) {
      res.status(422).json({ error: error.message });
      return;
    }
    next(error);
  }
});

digestItemsRouter.post('/classifica-esistenti', requireDigestToken, async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const snapshot = await digestItemsCollection.select('titolo', 'descrizione', 'tags').get();
    const missing = snapshot.docs.filter((document) => !Array.isArray(document.data().tags));
    const assignments = missing.map((document) => ({
      id: document.id,
      titolo: document.data().titolo,
      tags: classifyDigestTags(document.data().titolo ?? '', document.data().descrizione ?? ''),
    }));
    if (!dryRun) {
      for (let offset = 0; offset < assignments.length; offset += 400) {
        const batch = digestItemsCollection.firestore.batch();
        for (const assignment of assignments.slice(offset, offset + 400)) {
          batch.update(digestItemsCollection.doc(assignment.id), { tags: assignment.tags });
        }
        await batch.commit();
      }
    }
    res.json({ dryRun, total: snapshot.size, classified: assignments.length, assignments });
  } catch (error) {
    next(error);
  }
});

digestItemsRouter.post('/:id/preferito', requireDigestToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ error: 'ID digest item non valido' });
      return;
    }
    const document = digestItemsCollection.doc(id);
    const snapshot = await document.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Digest item non trovato' });
      return;
    }
    const preferito = snapshot.data()?.preferito !== true;
    await document.update({ preferito: preferito || null });
    res.status(200).json({ id, preferito });
  } catch (error) {
    next(error);
  }
});

digestItemsRouter.post('/:id/letto', requireDigestToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ error: 'ID digest item non valido' });
      return;
    }
    const document = digestItemsCollection.doc(id);
    const snapshot = await document.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Digest item non trovato' });
      return;
    }
    const letto = snapshot.data()?.letto !== true;
    await document.update({ letto: letto || null });
    res.status(200).json({ id, letto });
  } catch (error) {
    next(error);
  }
});

digestItemsRouter.patch('/:id', requireDigestToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ error: 'ID digest item non valido' });
      return;
    }

    const input = parseUpdateInput(req.body);
    const note = optionalPersonalNote((req.body as Record<string, unknown>).notaPersonale);
    const updates = {
      ...input,
      url: normalizeUrl(input.url),
      notaPersonale: note,
      tagsManual: true as const,
    };
    const document = digestItemsCollection.doc(id);
    const snapshot = await document.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Digest item non trovato' });
      return;
    }

    await document.update(updates);
    res.status(200).json({ updated: true, item: { ...snapshot.data(), ...updates } });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof ContentCaptureError) {
      res.status(422).json({ error: error.message });
      return;
    }
    next(error);
  }
});

digestItemsRouter.post('/:id/traduci', requireDigestToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ error: 'ID articolo non valido' });
      return;
    }
    const document = digestItemsCollection.doc(id);
    const snapshot = await document.get();
    const item = snapshot.exists ? snapshot.data() : undefined;
    if (!item || item.tipo !== 'articolo') {
      res.status(404).json({ error: 'Articolo non trovato' });
      return;
    }
    if (!item.testoLeggibile) {
      res.status(422).json({ error: 'Questo elemento non contiene testo traducibile' });
      return;
    }
    if (item.testoTradotto && item.titoloTradotto) {
      res.status(200).json({ translated: true, cached: true });
      return;
    }

    const translation = await translateArticleToItalian(item.titolo, item.testoLeggibile);
    await document.update({
      ...translation,
      linguaTraduzione: 'it',
      dataTraduzione: Timestamp.now(),
    });
    res.status(200).json({ translated: true, cached: false });
  } catch (error) {
    if (error instanceof ArticleTranslationError) {
      res.status(502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

digestItemsRouter.delete('/:id', requireDigestToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ error: 'ID digest item non valido' });
      return;
    }

    const document = digestItemsCollection.doc(id);
    const snapshot = await document.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: 'Digest item non trovato' });
      return;
    }

    await document.delete();
    res.status(200).json({ deleted: true, id: snapshot.id });
  } catch (error) {
    next(error);
  }
});
