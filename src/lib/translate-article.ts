import { GoogleAuth } from 'google-auth-library';
import { JSDOM } from 'jsdom';

const MAX_SEGMENT_CHARACTERS = 10_000;
const MAX_REQUEST_CHARACTERS = 20_000;
const TRANSLATION_SCOPE = 'https://www.googleapis.com/auth/cloud-translation';

interface TranslationResponse {
  translations?: Array<{ translatedText?: unknown }>;
}

interface TranslationUnit {
  source: string;
  translatedParts: string[];
  node: Node | null;
}

interface TranslationPart {
  text: string;
  unit: TranslationUnit;
}

export class ArticleTranslationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ArticleTranslationError';
  }
}

function splitText(value: string): string[] {
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > MAX_SEGMENT_CHARACTERS) {
    let splitAt = remaining.lastIndexOf(' ', MAX_SEGMENT_CHARACTERS);
    if (splitAt < MAX_SEGMENT_CHARACTERS / 2) splitAt = MAX_SEGMENT_CHARACTERS;
    else splitAt += 1;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function translateBatch(contents: string[], targetLanguageCode = 'it'): Promise<string[]> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new ArticleTranslationError('Progetto Google Cloud non configurato');
  const auth = new GoogleAuth({ scopes: [TRANSLATION_SCOPE] });
  const accessToken = await auth.getAccessToken();
  if (!accessToken) throw new ArticleTranslationError('Autenticazione Google Translation non disponibile');

  const endpoint = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/locations/global:translateText`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        mimeType: 'text/plain',
        targetLanguageCode,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ArticleTranslationError('Servizio di traduzione non raggiungibile', { cause: error });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('[translation error]', response.status, detail.slice(0, 1_000));
    throw new ArticleTranslationError(`Google Translation ha risposto HTTP ${response.status}`);
  }

  let payload: TranslationResponse;
  try {
    payload = (await response.json()) as TranslationResponse;
  } catch (error) {
    throw new ArticleTranslationError('Risposta di traduzione non valida', { cause: error });
  }

  const translations = payload.translations?.map((translation) =>
    typeof translation.translatedText === 'string' ? translation.translatedText : '');
  if (!translations || translations.length !== contents.length || translations.some((text) => !text)) {
    throw new ArticleTranslationError('Risposta di traduzione incompleta');
  }
  return translations;
}

export async function translateSearchTextsToEnglish(contents: string[]): Promise<string[]> {
  return translateBatch(contents, 'en');
}

export async function translateArticleToItalian(
  title: string,
  readableHtml: string,
  translate: (contents: string[]) => Promise<string[]> = translateBatch,
): Promise<{ titoloTradotto: string; testoTradotto: string }> {
  const dom = new JSDOM(`<body>${readableHtml}</body>`);
  try {
    const units: TranslationUnit[] = [{ source: title, translatedParts: [], node: null }];
    const walker = dom.window.document.createTreeWalker(
      dom.window.document.body,
      dom.window.NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue?.trim()) {
        units.push({ source: node.nodeValue, translatedParts: [], node });
      }
      node = walker.nextNode();
    }

    const parts: TranslationPart[] = units.flatMap((unit) =>
      splitText(unit.source).map((text) => ({ text, unit })));
    for (let offset = 0; offset < parts.length;) {
      const batch: TranslationPart[] = [];
      let characters = 0;
      while (offset < parts.length) {
        const part = parts[offset];
        if (!part) break;
        if (batch.length > 0 && characters + part.text.length > MAX_REQUEST_CHARACTERS) break;
        batch.push(part);
        characters += part.text.length;
        offset += 1;
      }

      const translated = await translate(batch.map((part) => part.text));
      batch.forEach((part, index) => part.unit.translatedParts.push(translated[index] ?? ''));
    }

    for (const unit of units) {
      if (unit.node) unit.node.nodeValue = unit.translatedParts.join('');
    }

    return {
      titoloTradotto: units[0]?.translatedParts.join('') || title,
      testoTradotto: dom.window.document.body.innerHTML,
    };
  } finally {
    dom.window.close();
  }
}
