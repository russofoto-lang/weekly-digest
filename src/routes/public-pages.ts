import { Router } from 'express';
import { digestTokensMatch } from '../lib/digest-auth.js';
import { env } from '../lib/env.js';
import { digestItemsCollection } from '../lib/firestore.js';
import { DIGEST_TAGS, type DigestTag } from '../lib/digest-tags.js';
import { searchDigestItems } from '../lib/search-items.js';
import {
  renderArchivePage,
  renderArticlePage,
  renderCategoriesPage,
  renderCategoryPage,
  renderDigestPage,
  renderNotFoundPage,
  renderSearchPage,
} from '../lib/web-pages.js';
import type { DigestItem } from '../types/digest-item.js';

export const publicPagesRouter = Router();

const ISO_WEEK_PATTERN = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;

function sendHtml(res: import('express').Response, html: string, status = 200): void {
  res.status(status).type('html').send(html);
}

function validAdminToken(req: import('express').Request): string | null {
  const token = typeof req.query.admin === 'string' ? req.query.admin : undefined;
  return digestTokensMatch(token, env.digestToken) ? token ?? null : null;
}

async function archivedItemsForWeek(settimana: string): Promise<DigestItem[]> {
  const snapshot = await digestItemsCollection
    .where('stato', '==', 'archiviato')
    .where('settimana', '==', settimana)
    .orderBy('dataAggiunta', 'asc')
    .get();

  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
}

publicPagesRouter.get('/', async (req, res, next) => {
  try {
    const [latestSnapshot, pendingSnapshot] = await Promise.all([
      digestItemsCollection
        .where('stato', '==', 'archiviato')
        .orderBy('settimana', 'desc')
        .limit(1)
        .get(),
      digestItemsCollection
        .where('stato', '==', 'pending')
        .get(),
    ]);
    const settimana = latestSnapshot.docs[0]?.data().settimana ?? null;
    const items = settimana ? await archivedItemsForWeek(settimana) : [];
    const pendingItems = pendingSnapshot.docs.map((document) => ({
      ...document.data(),
      id: document.id,
    })).sort(
      (left, right) => right.dataAggiunta.toMillis() - left.dataAggiunta.toMillis(),
    );
    sendHtml(res, renderDigestPage(
      settimana,
      items,
      validAdminToken(req),
      pendingItems,
    ));
  } catch (error) {
    next(error);
  }
});

publicPagesRouter.get('/archivio', async (req, res, next) => {
  try {
    const snapshot = await digestItemsCollection
      .where('stato', '==', 'archiviato')
      .orderBy('settimana', 'desc')
      .select('settimana')
      .get();
    const weeks = [...new Set(snapshot.docs.map((document) => document.data().settimana))];
    sendHtml(res, renderArchivePage(weeks, validAdminToken(req)));
  } catch (error) {
    next(error);
  }
});

publicPagesRouter.get('/categorie', async (req, res, next) => {
  try {
    const snapshot = await digestItemsCollection.select('tags').get();
    const counts = new Map<DigestTag, number>();
    for (const document of snapshot.docs) {
      for (const tag of document.data().tags ?? []) {
        if (DIGEST_TAGS.includes(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    sendHtml(res, renderCategoriesPage(counts, validAdminToken(req)));
  } catch (error) {
    next(error);
  }
});

publicPagesRouter.get('/categoria/:tag', async (req, res, next) => {
  try {
    const tag = req.params.tag as DigestTag;
    if (!DIGEST_TAGS.includes(tag)) {
      sendHtml(res, renderNotFoundPage(), 404);
      return;
    }
    const snapshot = await digestItemsCollection.where('tags', 'array-contains', tag).get();
    const items = snapshot.docs.map((document) => ({ ...document.data(), id: document.id }))
      .sort((left, right) => right.dataAggiunta.toMillis() - left.dataAggiunta.toMillis());
    sendHtml(res, renderCategoryPage(tag, items, validAdminToken(req)));
  } catch (error) {
    next(error);
  }
});

publicPagesRouter.get('/cerca', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length > 200 || (query.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) > 12) {
      res.status(400).json({ error: 'Ricerca troppo lunga: massimo 200 caratteri e 12 parole' });
      return;
    }
    const snapshot = query ? await digestItemsCollection.get() : null;
    const items = snapshot?.docs.map((document) => ({ ...document.data(), id: document.id })) ?? [];
    const result = await searchDigestItems(items, query);
    sendHtml(res, renderSearchPage(query, result, validAdminToken(req)));
  } catch (error) {
    next(error);
  }
});

publicPagesRouter.get('/settimana/:iso', async (req, res, next) => {
  try {
    const settimana = req.params.iso;
    if (!settimana || !ISO_WEEK_PATTERN.test(settimana)) {
      sendHtml(res, renderNotFoundPage(), 404);
      return;
    }

    const items = await archivedItemsForWeek(settimana);
    if (items.length === 0) {
      sendHtml(res, renderNotFoundPage(), 404);
      return;
    }
    sendHtml(res, renderDigestPage(settimana, items, validAdminToken(req)));
  } catch (error) {
    next(error);
  }
});

publicPagesRouter.get('/leggi/:id', async (req, res, next) => {
  try {
    const snapshot = await digestItemsCollection.doc(req.params.id).get();
    const item = snapshot.exists ? snapshot.data() : undefined;
    if (!item || item.tipo !== 'articolo') {
      sendHtml(res, renderNotFoundPage(), 404);
      return;
    }

    sendHtml(res, renderArticlePage(
      { ...item, id: snapshot.id },
      req.query.lang === 'it',
    ));
  } catch (error) {
    next(error);
  }
});
