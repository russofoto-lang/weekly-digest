import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { searchDigestItems } from './search-items.js';
import type { DigestItem } from '../types/digest-item.js';

function item(id: string, titolo: string, descrizione = ''): DigestItem {
  return {
    id, titolo, descrizione,
    url: `https://example.com/${id}`,
    tipo: 'articolo', thumbnail: '', testoLeggibile: null, durata: null,
    dataAggiunta: Timestamp.now(), stato: 'archiviato', settimana: '2026-W35',
  };
}

test('trova tutte le parole anche se sono divise tra titolo e descrizione', async () => {
  const items = [
    item('complete', 'AI per aziende', 'Strategie per realtà piccole'),
    item('partial', 'AI per aziende', 'Strategie generali'),
  ];
  const result = await searchDigestItems(items, 'ai aziende piccole', async (texts) => texts);
  assert.deepEqual(result.items.map((entry) => entry.id), ['complete']);
  assert.equal(result.matchedWords, 3);
});

test('riduce progressivamente il numero di parole richieste quando non trova corrispondenze complete', async () => {
  const items = [
    item('two', 'AI e aziende'),
    item('one', 'AI e ricerca'),
  ];
  const result = await searchDigestItems(items, 'ai aziende piccole', async (texts) => texts);
  assert.deepEqual(result.items.map((entry) => entry.id), ['two']);
  assert.equal(result.matchedWords, 2);
  assert.equal(result.totalWords, 3);
});

test('trova un articolo inglese e uno spagnolo tramite i metadati tradotti', async () => {
  const items = [
    item('english', 'AI for small businesses'),
    item('spanish', 'IA para pequeñas empresas'),
    item('other', 'Gardening for beginners'),
  ];
  const translations: Record<string, string> = {
    'aziende piccole': 'small businesses',
    'AI for small businesses\n': 'AI for small businesses',
    'IA para pequeñas empresas\n': 'AI for small businesses',
    'Gardening for beginners\n': 'Gardening for beginners',
  };
  const result = await searchDigestItems(items, 'aziende piccole', async (texts) =>
    texts.map((text) => translations[text] ?? text));
  assert.deepEqual(new Set(result.items.map((entry) => entry.id)), new Set(['english', 'spanish']));
  assert.equal(result.matchedWords, 2);
});

test('ignora le parole di collegamento aggiunte traducendo la query', async () => {
  const result = await searchDigestItems(
    [item('english-connectors', 'AI for small businesses')],
    'ai aziende piccole',
    async (texts) => texts.map((text) => text === 'ai aziende piccole' ? 'to small businesses' : text),
  );
  assert.deepEqual(result.items.map((entry) => entry.id), ['english-connectors']);
  assert.equal(result.matchedWords, 2);
  assert.equal(result.totalWords, 2);
});

test('se la traduzione non è disponibile cerca comunque nelle parole originali', async () => {
  const result = await searchDigestItems(
    [item('local', 'Aziende piccole')], 'aziende piccole',
    async () => { throw new Error('offline'); },
  );
  assert.deepEqual(result.items.map((entry) => entry.id), ['local']);
  assert.equal(result.translationUnavailable, true);
});
