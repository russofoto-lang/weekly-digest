import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDigestTags, parseDigestTags } from './digest-tags.js';

test('assegna più temi a un articolo e usa titolo e descrizione', () => {
  const tags = classifyDigestTags('AI per piccole aziende', 'Idee per campagne pubblicitarie');
  assert.deepEqual(new Set(tags), new Set(['AI', 'Business', 'Marketing']));
});

test('riconosce anche titoli inglesi e rimanda i casi ambigui alla verifica', () => {
  assert.ok(classifyDigestTags('How founders build on Claude Managed Agents', '').includes('AI'));
  assert.deepEqual(classifyDigestTags('Un link da esaminare', ''), ['Da verificare']);
});

test('convalida le categorie scelte manualmente', () => {
  assert.deepEqual(parseDigestTags(['AI', 'AI', 'Video']), ['AI', 'Video']);
  assert.deepEqual(parseDigestTags([]), ['Da verificare']);
  assert.throws(() => parseDigestTags(['Categoria inventata']));
  assert.throws(() => parseDigestTags(['AI', 'Video', 'Business', 'Marketing']));
});
