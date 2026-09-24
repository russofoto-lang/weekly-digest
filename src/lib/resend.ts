import { env } from './env.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 15_000;

export class ResendError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResendError';
  }
}

export interface ResendEmailReceipt {
  id: string | null;
}

export async function sendDigestEmail(
  subject: string,
  html: string,
  idempotencyKey?: string,
): Promise<ResendEmailReceipt> {
  let response: Response;
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${env.resendApiKey}`,
      'content-type': 'application/json',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: env.digestFrom,
        to: env.digestRecipients,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ResendError('Resend non raggiungibile', { cause: error });
  }

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new ResendError(
      `Invio Resend fallito (HTTP ${response.status})${details ? `: ${details}` : ''}`,
    );
  }

  const responseBody = await response.text();
  if (!responseBody) return { id: null };

  try {
    const parsed = JSON.parse(responseBody) as { id?: unknown };
    return { id: typeof parsed.id === 'string' ? parsed.id : null };
  } catch {
    return { id: null };
  }
}
