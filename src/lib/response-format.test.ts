import assert from 'node:assert/strict';
import test from 'node:test';
import { prefersHtmlResponse } from './response-format.js';

test('preferisce HTML soltanto quando text/html è esplicito e negoziato', () => {
  assert.equal(prefersHtmlResponse('text/html,application/xhtml+xml', 'html'), true);
  assert.equal(prefersHtmlResponse('application/json,text/html;q=0.5', 'json'), false);
  assert.equal(prefersHtmlResponse('application/json', 'json'), false);
  assert.equal(prefersHtmlResponse('*/*', 'html'), false);
  assert.equal(prefersHtmlResponse(undefined, 'html'), false);
});
