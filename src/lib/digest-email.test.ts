import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { buildDigestEmailHtml } from './digest-email.js';
import type { DigestItem } from '../types/digest-item.js';

function item(overrides: Partial<DigestItem>): DigestItem {
  return {
    id: 'item-1',
    url: 'https://example.com/originale',
    tipo: 'articolo',
    titolo: 'Titolo',
    descrizione: 'Descrizione',
    thumbnail: 'https://example.com/image.jpg',
    testoLeggibile: '<p>Testo</p>',
    durata: null,
    dataAggiunta: Timestamp.fromDate(new Date('2026-08-24T10:00:00Z')),
    stato: 'pending',
    settimana: '2026-W35',
    ...overrides,
  };
}

test('genera card mobile-friendly, conteggi e link corretti', () => {
  const html = buildDigestEmailHtml({
    baseUrl: 'https://digest.example.com',
    date: new Date('2026-08-28T16:00:00Z'),
    items: [
      item({ titolo: 'Articolo <speciale>' }),
      item({ id: 'video-1', tipo: 'youtube', url: 'https://youtu.be/abc', titolo: 'Video' }),
    ],
  });

  assert.match(html, /24 agosto 2026 – 30 agosto 2026/);
  assert.match(html, /2 salvataggi · 1 articolo · 1 video/);
  assert.match(html, /href="https:\/\/digest\.example\.com\/leggi\/item-1"/);
  assert.match(html, /href="https:\/\/youtu\.be\/abc"/);
  assert.match(html, /width="72" height="72"/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /Articolo &lt;speciale&gt;/);
  assert.doesNotMatch(html, /Articolo <speciale>/);
});

test('in email un articolo manuale senza testo apre URL originale', () => {
  const html = buildDigestEmailHtml({
    baseUrl: 'https://digest.example.com',
    date: new Date('2026-08-28T16:00:00Z'),
    items: [item({ testoLeggibile: null, url: 'https://www.reddit.com/r/italy/comments/abc/post/' })],
  });

  assert.match(html, /href="https:\/\/www\.reddit\.com\/r\/italy\/comments\/abc\/post\/"/);
  assert.doesNotMatch(html, /\/leggi\/item-1/);
});
