import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.DIGEST_TOKEN ??= 'test-secret';
process.env.RESEND_API_KEY ??= 're_test';
process.env.BASE_URL ??= 'https://digest.example.com';
process.env.DIGEST_RECIPIENTS ??= 'one@example.com,two@example.com';
process.env.DIGEST_FROM ??= 'Digest <digest@example.com>';

const { ResendError, sendDigestEmail } = await import('./resend.js');

test('invia il payload Resend previsto e tratta i non-2xx come errore', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest: { url: string; init?: RequestInit } | undefined;

  try {
    globalThis.fetch = async (input, init) => {
      capturedRequest = { url: String(input), init };
      return Response.json({ id: 'email_123' }, { status: 202 });
    };

    const receipt = await sendDigestEmail(
      'Oggetto',
      '<p>Digest</p>',
      'weekly-digest/2026-W35/abc',
    );
    assert.equal(receipt.id, 'email_123');
    assert.equal(capturedRequest?.url, 'https://api.resend.com/emails');
    assert.equal(capturedRequest?.init?.method, 'POST');
    assert.equal(
      (capturedRequest?.init?.headers as Record<string, string>).authorization,
      'Bearer re_test',
    );
    assert.equal(
      (capturedRequest?.init?.headers as Record<string, string>)['Idempotency-Key'],
      'weekly-digest/2026-W35/abc',
    );
    assert.deepEqual(JSON.parse(String(capturedRequest?.init?.body)), {
      from: 'Digest <digest@example.com>',
      to: ['one@example.com', 'two@example.com'],
      subject: 'Oggetto',
      html: '<p>Digest</p>',
    });

    globalThis.fetch = async () => new Response('provider error', { status: 500 });
    await assert.rejects(
      () => sendDigestEmail('Oggetto', '<p>Digest</p>'),
      (error: unknown) => error instanceof ResendError && /HTTP 500/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
