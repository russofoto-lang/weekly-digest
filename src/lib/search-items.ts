import type { DigestItem } from '../types/digest-item.js';
import { translateSearchTextsToEnglish } from './translate-article.js';

const MAX_TRANSLATION_BATCH_CHARACTERS = 20_000;
const MAX_CACHED_ITEMS = 2_000;
const ENGLISH_CONNECTORS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);
const translationCache = new Map<string, { source: string; english: string }>();

export interface SearchResult {
  items: DigestItem[];
  matchedWords: number;
  totalWords: number;
  translationUnavailable: boolean;
}

function words(value: string): string[] {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('und')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function uniqueWords(value: string): string[] {
  return [...new Set(words(value))];
}

function sourceText(item: DigestItem): string {
  return `${item.titolo}\n${item.descrizione}`;
}

async function translateInBatches(
  texts: string[],
  translate: (contents: string[]) => Promise<string[]>,
): Promise<string[]> {
  const translated: string[] = [];
  for (let offset = 0; offset < texts.length;) {
    const batch: string[] = [];
    let characters = 0;
    while (offset < texts.length && (batch.length === 0 || characters + texts[offset]!.length <= MAX_TRANSLATION_BATCH_CHARACTERS)) {
      const text = texts[offset]!;
      batch.push(text);
      characters += text.length;
      offset += 1;
    }
    const result = await translate(batch);
    if (result.length !== batch.length || result.some((text) => !text)) {
      throw new Error('Risposta di traduzione incompleta');
    }
    translated.push(...result);
  }
  return translated;
}

export async function searchDigestItems(
  items: DigestItem[],
  query: string,
  translate: (contents: string[]) => Promise<string[]> = translateSearchTextsToEnglish,
): Promise<SearchResult> {
  const originalTerms = uniqueWords(query);
  if (originalTerms.length === 0) {
    return { items: [], matchedWords: 0, totalWords: 0, translationUnavailable: false };
  }

  const missing = items.filter((item) => {
    const cached = translationCache.get(item.id);
    return !cached || cached.source !== sourceText(item);
  });
  let englishQuery = query;
  let translationUnavailable = false;
  try {
    const translated = await translateInBatches(
      [query, ...missing.map(sourceText)], translate,
    );
    englishQuery = translated[0] ?? query;
    missing.forEach((item, index) => {
      translationCache.set(item.id, {
        source: sourceText(item),
        english: translated[index + 1] ?? sourceText(item),
      });
    });
    while (translationCache.size > MAX_CACHED_ITEMS) {
      const oldest = translationCache.keys().next().value;
      if (oldest === undefined) break;
      translationCache.delete(oldest);
    }
  } catch (error) {
    console.warn('[search translation unavailable]', error);
    translationUnavailable = true;
  }

  const englishTerms = uniqueWords(englishQuery);
  const meaningfulEnglishTerms = englishTerms.filter((term) => !ENGLISH_CONNECTORS.has(term));
  const variants = [originalTerms, meaningfulEnglishTerms.length ? meaningfulEnglishTerms : englishTerms]
    .filter((terms) => terms.length > 0);
  const scored = items.map((item) => {
    const cached = translationCache.get(item.id);
    const searchable = `${sourceText(item)}\n${cached?.source === sourceText(item) ? cached.english : ''}`;
    const availableWords = new Set(words(searchable));
    const matches = variants.map((terms) => ({
      matched: terms.filter((term) => availableWords.has(term)).length,
      total: terms.length,
    }));
    const full = matches.find((match) => match.matched === match.total);
    const best = full ?? matches.reduce((left, right) =>
      right.matched / right.total > left.matched / left.total ? right : left);
    return { item, ...best, full: Boolean(full) };
  });

  const hasFullMatch = scored.some((entry) => entry.full);
  const bestRatio = Math.max(0, ...scored.map((entry) => entry.matched / entry.total));
  const selected = scored.filter((entry) => hasFullMatch
    ? entry.full
    : entry.matched > 0 && entry.matched / entry.total === bestRatio);
  selected.sort((left, right) =>
    right.matched - left.matched || right.item.dataAggiunta.toMillis() - left.item.dataAggiunta.toMillis());

  return {
    items: selected.map((entry) => entry.item),
    matchedWords: selected[0]?.matched ?? 0,
    totalWords: selected[0]?.total ?? originalTerms.length,
    translationUnavailable,
  };
}
