import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';
import type { CapturedDigestItem } from '../types/digest-item.js';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_INDEXED_URL_BYTES = 1_500;
const TRACKING_PARAMETERS = new Set([
  'fbclid', 'gclid', 'ocid', 'cvid', 'cvpid', 'ei', 'ref', 'si',
]);
const MISSING_VALUE_PATTERN = /\b(?:undefined|null)\b/i;
export const MAX_READABLE_TEXT_LENGTH = 500_000;
const READABLE_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'strong', 'em', 'a', 'img', 'figure', 'figcaption', 'br',
] as const;
const USER_AGENT =
  'Mozilla/5.0 (compatible; WeeklyDigest/1.0; +https://cloud.google.com/run)';
const FALLBACK_ARTICLE_SELECTORS = [
  '[itemprop="articleBody"]',
  '[data-testid="article-body"]',
  '.news-txt',
  '.article-body',
  '.article-content',
  '.story-body',
  '.entry-content',
  '.post-content',
  'article',
  'main',
] as const;
const FALLBACK_NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'form', 'nav', 'aside', 'footer',
  '[class*="cookie"]', '[id*="cookie"]',
  '[class*="paywall"]', '[id*="paywall"]',
  '[class*="subscription"]', '[id*="subscription"]',
  '[class*="advert"]', '[id*="advert"]',
  '[class*="banner"]', '[id*="banner"]',
  '[class*="social"]', '[id*="social"]',
  '[class*="share"]', '[id*="share"]',
  '[class*="related"]', '[id*="related"]',
  '[class*="newsletter"]', '[id*="newsletter"]',
  '.prompt-to-accept', '.prompt-to-accept__wrapper',
] as const;
const BOILERPLATE_PATTERN = /(?:accetta(?:re)? (?:tutti )?i cookie|cookie (?:di )?(?:profilazione|tracciamento)|abbonati|sottoscrivi(?: un)? abbonamento|pubblicit[aà]|riproduzione riservata|iscriviti alla newsletter|contenuti consentiti)/i;
const MIN_FALLBACK_PARAGRAPH_LENGTH = 30;
const MIN_FALLBACK_TEXT_LENGTH = 80;

export class ContentCaptureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ContentCaptureError';
  }
}

interface YouTubeOEmbedResponse {
  title?: unknown;
  thumbnail_url?: unknown;
  author_name?: unknown;
}

interface RedditOEmbedResponse {
  title?: unknown;
  author_name?: unknown;
  thumbnail_url?: unknown;
  provider_name?: unknown;
}

interface DocumentMetadata {
  ogTitle: string;
  twitterTitle: string;
  documentTitle: string;
  ogDescription: string;
  twitterDescription: string;
  metaDescription: string;
  ogImage: string;
  twitterImage: string;
  firstImage: string;
}

interface ReadableArticle {
  titolo: string;
  testo: string;
  testoPiano: string;
  troncato: boolean;
}

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function safeValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = clean(value);
  return !cleaned || MISSING_VALUE_PATTERN.test(cleaned) ? '' : cleaned;
}

function firstAvailable(...values: unknown[]): string {
  for (const value of values) {
    const candidate = safeValue(value);
    if (candidate) return candidate;
  }
  return '';
}

function isTrackingParameter(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_PARAMETERS.has(normalized);
}

export function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);
  let candidate = '';

  if (host === 'youtu.be') {
    candidate = segments[0] ?? '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname.replace(/\/+$/, '') === '/watch') {
      candidate = url.searchParams.get('v') ?? '';
    } else if (['shorts', 'live', 'embed'].includes(segments[0] ?? '')) {
      candidate = segments[1] ?? '';
    }
  }

  const decoded = safeValue(candidate);
  return /^[A-Za-z0-9_-]{1,64}$/.test(decoded) ? decoded : null;
}

export function isYouTubeUrl(url: URL): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export function isRedditUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return host === 'reddit.com' || host === 'old.reddit.com'
    || host === 'new.reddit.com' || host === 'redd.it';
}

export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new ContentCaptureError('URL non valido', { cause: error });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ContentCaptureError('Sono supportati solo URL HTTP o HTTPS');
  }

  const keysToRemove = [...url.searchParams.keys()].filter(isTrackingParameter);
  for (const key of keysToRemove) url.searchParams.delete(key);

  const videoId = extractYouTubeVideoId(url);
  const normalized = videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : url.toString();

  if (new TextEncoder().encode(normalized).length > MAX_INDEXED_URL_BYTES) {
    throw new ContentCaptureError('URL troppo lungo per essere indicizzato');
  }
  return normalized;
}

function removeLeadingNoise(html: string): string {
  const $ = cheerio.load(html, null, false);
  let foundSubstantialParagraph = false;

  $('p').each((_index, element) => {
    if (foundSubstantialParagraph) return;
    const text = clean($(element).text());
    if (text.length < 30) {
      $(element).remove();
      return;
    }
    foundSubstantialParagraph = true;
  });

  return $.html().trim();
}

function readableTextFromHtml(html: string): string {
  const $ = cheerio.load(html, null, false);
  const paragraphs = $('p').toArray()
    .map((element) => clean($(element).text()))
    .filter(Boolean);
  return clean(paragraphs.join(' ') || $.text());
}

function isUsableReadableContent(html: string): boolean {
  const $ = cheerio.load(html, null, false);
  const paragraphs = $('p').toArray()
    .map((element) => clean($(element).text()))
    .filter((text) => text.length >= MIN_FALLBACK_PARAGRAPH_LENGTH
      && !BOILERPLATE_PATTERN.test(text));
  return paragraphs.join(' ').length >= MIN_FALLBACK_TEXT_LENGTH;
}

interface StructuredArticleCandidate {
  body: string;
  title: string;
}

function structuredBodyHtml(value: string): string {
  if (/<(?:p|div|h[1-6]|ul|ol|li|blockquote|figure)\b/i.test(value)) return value;
  const paragraphs = value.split(/\n\s*\n/).map(clean).filter(Boolean);
  const $ = cheerio.load('<div></div>', null, false);
  for (const paragraph of paragraphs) $('div').append($('<p>').text(paragraph));
  return $('div').html() ?? '';
}

function collectStructuredArticleCandidates(value: unknown): StructuredArticleCandidate[] {
  const candidates: StructuredArticleCandidate[] = [];

  function visit(node: unknown, depth: number): void {
    if (depth > 25 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const explicitBody = firstAvailable(record.articleBody, record.articleContent);
    const hasTitle = Boolean(firstAvailable(record.headline, record.title, record.name));
    const genericBody = hasTitle ? firstAvailable(record.body, record.content) : '';
    const body = explicitBody || genericBody;
    if (body) {
      candidates.push({
        body,
        title: firstAvailable(record.headline, record.title, record.name),
      });
    }

    for (const child of Object.values(record)) visit(child, depth + 1);
  }

  visit(value, 0);
  return candidates;
}

function extractStructuredReadableHtml(html: string): ReadableArticle | null {
  const $ = cheerio.load(html);
  const candidates: ReadableArticle[] = [];

  $('script[type*="json"], script#__NEXT_DATA__, script#__NUXT_DATA__').each((_index, script) => {
    const rawJson = $(script).html()?.trim();
    if (!rawJson || rawJson.length > 5_000_000) return;

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      for (const candidate of collectStructuredArticleCandidates(parsed)) {
        const readable = sanitizeAndLimitReadableHtml(structuredBodyHtml(candidate.body));
        if (!readable.testo || !isUsableReadableContent(readable.testo)) continue;
        candidates.push({
          testo: readable.testo,
          testoPiano: readableTextFromHtml(readable.testo),
          titolo: candidate.title,
          troncato: readable.troncato,
        });
      }
    } catch {
      // Un blocco JSON non valido non deve impedire gli altri fallback.
    }
  });

  return candidates.sort(
    (left, right) => right.testoPiano.length - left.testoPiano.length,
  )[0] ?? null;
}

function extractNextFlightReadableHtml(html: string): ReadableArticle | null {
  const $ = cheerio.load(html);
  const payloadParts: string[] = [];

  $('script').each((_index, script) => {
    const raw = $(script).html()?.trim() ?? '';
    const match = raw.match(/^self\.__next_f\.push\((.*)\)\s*;?$/s);
    if (!match?.[1]) return;
    try {
      const payload = JSON.parse(match[1]) as unknown;
      if (Array.isArray(payload) && typeof payload[1] === 'string') {
        payloadParts.push(payload[1]);
      }
    } catch {
      // Ignora i segmenti Flight non decodificabili.
    }
  });

  const stream = payloadParts.join('');
  if (!stream) return null;
  const chunks = new Map<string, ReadableArticle>();
  const markerPattern = /([0-9a-f]+):T([0-9a-f]+),/gi;

  for (const marker of stream.matchAll(markerPattern)) {
    if (marker.index === undefined || !marker[1] || !marker[2]) continue;
    const byteLength = Number.parseInt(marker[2], 16);
    if (!Number.isFinite(byteLength) || byteLength <= 0 || byteLength > 5_000_000) continue;
    const contentStart = marker.index + marker[0].length;
    const remainingBytes = new TextEncoder().encode(stream.slice(contentStart));
    if (remainingBytes.length < byteLength) continue;
    const content = new TextDecoder().decode(remainingBytes.slice(0, byteLength));
    const readable = sanitizeAndLimitReadableHtml(content);
    if (!readable.testo || !isUsableReadableContent(readable.testo)) continue;
    const document = cheerio.load(readable.testo, null, false);
    chunks.set(marker[1].toLowerCase(), {
      titolo: firstAvailable(document('h1').first().text()),
      testo: readable.testo,
      testoPiano: readableTextFromHtml(readable.testo),
      troncato: readable.troncato,
    });
  }

  const language = safeValue($('html').attr('lang')).split('-')[0]?.toUpperCase() ?? '';
  const preferredKeys = language ? [`content${language}`, 'content'] : ['content'];
  for (const key of preferredKeys) {
    const reference = stream.match(new RegExp(`"${key}"\\s*:\\s*"\\$([0-9a-f]+)"`, 'i'))?.[1];
    const preferred = reference ? chunks.get(reference.toLowerCase()) : undefined;
    if (preferred) return preferred;
  }

  return [...chunks.values()].sort(
    (left, right) => right.testoPiano.length - left.testoPiano.length,
  )[0] ?? null;
}

/** Estrazione conservativa per layout che Readability non riconosce. */
export function extractFallbackReadableHtml(html: string): {
  testo: string;
  testoPiano: string;
  titolo: string;
  troncato: boolean;
} | null {
  const $ = cheerio.load(html);
  const nextFlight = extractNextFlightReadableHtml(html);
  let domCandidate: ReadableArticle | null = null;

  outer:
  for (const selector of FALLBACK_ARTICLE_SELECTORS) {
    for (const element of $(selector).toArray()) {
      const candidate = $(element).clone();
      candidate.find(FALLBACK_NOISE_SELECTORS.join(',')).remove();
      candidate.find('p').each((_index, paragraph) => {
        const text = clean($(paragraph).text());
        if (!text || BOILERPLATE_PATTERN.test(text)) $(paragraph).remove();
      });

      const readable = sanitizeAndLimitReadableHtml(candidate.html() ?? '');
      if (!readable.testo || !isUsableReadableContent(readable.testo)) continue;

      domCandidate = {
        testo: readable.testo,
        testoPiano: readableTextFromHtml(readable.testo),
        titolo: firstAvailable(candidate.find('h1').first().text()),
        troncato: readable.troncato,
      };
      break outer;
    }
  }

  const structured = extractStructuredReadableHtml(html);
  return [nextFlight, structured, domCandidate]
    .filter((candidate): candidate is ReadableArticle => candidate !== null)
    .sort((left, right) => right.testoPiano.length - left.testoPiano.length)[0] ?? null;
}

export function sanitizeAndLimitReadableHtml(html: string): {
  testo: string;
  troncato: boolean;
} {
  const sanitized = sanitizeHtml(html, {
    allowedTags: [...READABLE_TAGS],
    allowedAttributes: {
      a: ['href'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  }).trim();
  const withoutNoise = removeLeadingNoise(sanitized);
  const troncato = withoutNoise.length > MAX_READABLE_TEXT_LENGTH;
  return {
    testo: troncato ? withoutNoise.slice(0, MAX_READABLE_TEXT_LENGTH) : withoutNoise,
    troncato,
  };
}

function absoluteHttpUrl(value: unknown, pageUrl: URL): string {
  const candidate = safeValue(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate, pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function firstSignificantImage($: cheerio.CheerioAPI, pageUrl: URL): string {
  for (const element of $('img').toArray()) {
    const image = $(element);
    const source = image.attr('src') ?? image.attr('data-src') ?? image.attr('data-lazy-src');
    const descriptor = `${source ?? ''} ${image.attr('class') ?? ''} ${image.attr('id') ?? ''} ${image.attr('alt') ?? ''}`;
    const width = Number(image.attr('width'));
    const height = Number(image.attr('height'));
    if (/\b(?:icon|logo|avatar|sprite|pixel|tracking)\b/i.test(descriptor)) continue;
    if ((Number.isFinite(width) && width > 0 && width < 120)
      || (Number.isFinite(height) && height > 0 && height < 80)) continue;

    const resolved = absoluteHttpUrl(source, pageUrl);
    if (resolved) return resolved;
  }
  return '';
}

async function extractDocumentMetadata(html: string, pageUrl: URL): Promise<DocumentMetadata> {
  const $ = cheerio.load(html);
  const meta = (selector: string): string => safeValue($(selector).first().attr('content'));

  return {
    ogTitle: meta('meta[property="og:title"]'),
    twitterTitle: firstAvailable(
      meta('meta[name="twitter:title"]'),
      meta('meta[property="twitter:title"]'),
    ),
    documentTitle: safeValue($('title').first().text()),
    ogDescription: meta('meta[property="og:description"]'),
    twitterDescription: firstAvailable(
      meta('meta[name="twitter:description"]'),
      meta('meta[property="twitter:description"]'),
    ),
    metaDescription: meta('meta[name="description"]'),
    ogImage: absoluteHttpUrl(meta('meta[property="og:image"]'), pageUrl),
    twitterImage: absoluteHttpUrl(firstAvailable(
      meta('meta[name="twitter:image"]'),
      meta('meta[property="twitter:image"]'),
    ), pageUrl),
    firstImage: firstSignificantImage($, pageUrl),
  };
}

async function extractReadableArticle(html: string, url: URL): Promise<ReadableArticle> {
  let dom: JSDOM | undefined;
  try {
    dom = new JSDOM(html, { url: url.toString() });
    let readabilityCandidate: ReadableArticle | null = null;
    try {
      const article = new Readability(dom.window.document).parse();
      const readable = sanitizeAndLimitReadableHtml(article?.content ?? '');
      if (article && readable.testo && isUsableReadableContent(readable.testo)) {
        readabilityCandidate = {
          titolo: firstAvailable(article.title),
          testo: readable.testo,
          testoPiano: readableTextFromHtml(readable.testo),
          troncato: readable.troncato,
        };
      }
    } catch {
      // Alcuni DOM validi mandano in errore Readability: il fallback resta utilizzabile.
    }

    const fallback = extractFallbackReadableHtml(html);
    const bestCandidate = [readabilityCandidate, fallback]
      .filter((candidate): candidate is ReadableArticle => candidate !== null)
      .sort((left, right) => right.testoPiano.length - left.testoPiano.length)[0];
    if (bestCandidate) return bestCandidate;

    throw new ContentCaptureError('Il contenuto principale dell’articolo non è parsabile');
  } catch (error) {
    if (error instanceof ContentCaptureError) throw error;
    throw new ContentCaptureError('HTML dell’articolo non parsabile', { cause: error });
  } finally {
    dom?.window.close();
  }
}

export async function extractArticleDataFromHtml(
  html: string,
  url: URL,
): Promise<CapturedDigestItem> {
  if (!html.trim()) throw new ContentCaptureError('L’articolo restituisce HTML vuoto');

  const [metadata, readable] = await Promise.all([
    extractDocumentMetadata(html, url),
    extractReadableArticle(html, url),
  ]);
  const titolo = firstAvailable(
    metadata.ogTitle,
    metadata.twitterTitle,
    metadata.documentTitle,
    readable.titolo,
    url.hostname,
  );
  const descrizione = firstAvailable(
    metadata.ogDescription,
    metadata.twitterDescription,
    metadata.metaDescription,
    readable.testoPiano.slice(0, 200),
  );
  const thumbnail = firstAvailable(
    metadata.ogImage,
    metadata.twitterImage,
    metadata.firstImage,
  );

  return {
    url: url.toString(),
    tipo: 'articolo',
    titolo,
    descrizione,
    thumbnail,
    testoLeggibile: readable.testo,
    durata: null,
    ...(readable.troncato ? { troncato: true as const } : {}),
  };
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { accept, 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError'
      ? 'tempo di risposta scaduto'
      : 'errore di rete';
    throw new ContentCaptureError(`URL non raggiungibile: ${reason}`, { cause: error });
  }
}

async function captureYouTube(videoId: string): Promise<CapturedDigestItem> {
  const canonicalUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', canonicalUrl);
  endpoint.searchParams.set('format', 'json');

  const response = await fetchWithTimeout(endpoint.toString(), 'application/json');
  if (!response.ok) {
    throw new ContentCaptureError(
      `Video YouTube non raggiungibile o non valido (oEmbed HTTP ${response.status})`,
    );
  }

  let payload: YouTubeOEmbedResponse;
  try {
    payload = (await response.json()) as YouTubeOEmbedResponse;
  } catch (error) {
    throw new ContentCaptureError('Risposta oEmbed di YouTube non parsabile', { cause: error });
  }

  const titolo = safeValue(payload.title);
  const thumbnail = safeValue(payload.thumbnail_url);
  if (!titolo || !thumbnail) throw new ContentCaptureError('Dati oEmbed di YouTube incompleti');

  return {
    url: canonicalUrl,
    tipo: 'youtube',
    titolo,
    descrizione: safeValue(payload.author_name),
    thumbnail,
    testoLeggibile: null,
    durata: null,
  };
}

async function captureReddit(url: URL): Promise<CapturedDigestItem> {
  const endpoint = new URL('https://www.reddit.com/oembed');
  endpoint.searchParams.set('url', url.toString());

  const response = await fetchWithTimeout(endpoint.toString(), 'application/json');
  if (!response.ok) {
    throw new ContentCaptureError(
      `Post Reddit non raggiungibile o non valido (oEmbed HTTP ${response.status})`,
    );
  }

  let payload: RedditOEmbedResponse;
  try {
    payload = (await response.json()) as RedditOEmbedResponse;
  } catch (error) {
    throw new ContentCaptureError('Risposta oEmbed di Reddit non parsabile', { cause: error });
  }

  const titolo = safeValue(payload.title);
  if (!titolo) throw new ContentCaptureError('Dati oEmbed di Reddit incompleti');
  const author = safeValue(payload.author_name);
  const provider = firstAvailable(payload.provider_name, 'Reddit');

  return {
    url: url.toString(),
    tipo: 'articolo',
    titolo,
    descrizione: author ? `u/${author.replace(/^u\//, '')} · ${provider}` : provider,
    thumbnail: safeValue(payload.thumbnail_url),
    testoLeggibile: null,
    durata: null,
  };
}

async function captureArticle(url: URL): Promise<CapturedDigestItem> {
  const response = await fetchWithTimeout(
    url.toString(),
    'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  );
  if (!response.ok) {
    throw new ContentCaptureError(`Articolo non raggiungibile (HTTP ${response.status})`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml')) {
    throw new ContentCaptureError(`L’URL non restituisce HTML (${contentType})`);
  }

  let html: string;
  try {
    html = await response.text();
  } catch (error) {
    throw new ContentCaptureError('Impossibile leggere l’HTML dell’articolo', { cause: error });
  }
  return extractArticleDataFromHtml(html, url);
}

export async function captureContent(rawUrl: string): Promise<CapturedDigestItem> {
  try {
    const normalizedUrl = normalizeUrl(rawUrl);
    const url = new URL(normalizedUrl);
    const videoId = extractYouTubeVideoId(url);
    if (videoId) return await captureYouTube(videoId);
    if (isRedditUrl(url)) return await captureReddit(url);
    return await captureArticle(url);
  } catch (error) {
    if (error instanceof ContentCaptureError) throw error;
    throw new ContentCaptureError('Impossibile acquisire o analizzare l’URL', { cause: error });
  }
}
