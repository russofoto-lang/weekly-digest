import type { DigestItem } from '../types/digest-item.js';

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatDigestSummary(items: Array<Pick<DigestItem, 'tipo'>>): string {
  const articleCount = items.filter((item) => item.tipo === 'articolo').length;
  const videoCount = items.filter((item) => item.tipo === 'youtube').length;
  return [
    plural(items.length, 'salvataggio', 'salvataggi'),
    plural(articleCount, 'articolo', 'articoli'),
    plural(videoCount, 'video', 'video'),
  ].join(' · ');
}
