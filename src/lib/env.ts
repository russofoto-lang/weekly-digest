import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}

function requiredUrl(name: string): string {
  const value = required(name).replace(/\/+$/, '');
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`Variabile d'ambiente non valida: ${name} deve essere un URL HTTP(S)`);
  }
  return value;
}

function requiredList(name: string): string[] {
  const values = required(name).split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new Error(`Variabile d'ambiente non valida: ${name}`);
  return values;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  firebaseProjectId: required('FIREBASE_PROJECT_ID'),
  digestToken: required('DIGEST_TOKEN'),
  resendApiKey: required('RESEND_API_KEY'),
  baseUrl: requiredUrl('BASE_URL'),
  digestRecipients: requiredList('DIGEST_RECIPIENTS'),
  digestFrom: required('DIGEST_FROM'),
};
