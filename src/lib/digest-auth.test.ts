import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.DIGEST_TOKEN ??= 'test-secret';
process.env.RESEND_API_KEY ??= 're_test';
process.env.BASE_URL ??= 'https://digest.example.com';
process.env.DIGEST_RECIPIENTS ??= 'reader@example.com';
process.env.DIGEST_FROM ??= 'Digest <digest@example.com>';

const { digestTokensMatch } = await import('./digest-auth.js');

test('accetta soltanto il token digest esatto', () => {
  assert.equal(digestTokensMatch('test-secret', 'test-secret'), true);
  assert.equal(digestTokensMatch(undefined, 'test-secret'), false);
  assert.equal(digestTokensMatch('wrong', 'test-secret'), false);
  assert.equal(digestTokensMatch('test-secret-extra', 'test-secret'), false);
});
