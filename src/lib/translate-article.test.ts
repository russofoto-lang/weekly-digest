import assert from 'node:assert/strict';
import test from 'node:test';
import { translateArticleToItalian } from './translate-article.js';

test('traduce titolo e nodi testuali preservando HTML sanificato', async () => {
  const calls: string[][] = [];
  const result = await translateArticleToItalian(
    'Original title',
    '<h2>First section</h2><p>Hello <strong>world</strong>.</p><p><a href="https://example.com">Read more</a></p>',
    async (contents) => {
      calls.push(contents);
      return contents.map((content) => `IT:${content}`);
    },
  );

  assert.equal(result.titoloTradotto, 'IT:Original title');
  assert.match(result.testoTradotto, /<h2>IT:First section<\/h2>/);
  assert.match(result.testoTradotto, /<strong>IT:world<\/strong>/);
  assert.match(result.testoTradotto, /href="https:\/\/example\.com"/);
  assert.ok(calls.length >= 1);
});

test('suddivide testi lunghi in richieste sotto il limite configurato', async () => {
  const requestSizes: number[] = [];
  const longText = `${'A long sentence with spaces. '.repeat(1_200)}`;
  const result = await translateArticleToItalian(
    'Title',
    `<p>${longText}</p>`,
    async (contents) => {
      requestSizes.push(contents.reduce((total, content) => total + content.length, 0));
      return contents;
    },
  );

  assert.ok(requestSizes.length > 1);
  assert.ok(requestSizes.every((size) => size <= 20_000));
  assert.match(result.testoTradotto, /A long sentence with spaces/);
});
