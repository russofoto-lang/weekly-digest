export const DIGEST_TAGS = [
  'AI', 'Business', 'Marketing', 'Tecnologia', 'Produttività',
  'Video', 'Musica', 'Attualità', 'Da verificare',
] as const;

export type DigestTag = (typeof DIGEST_TAGS)[number];

const RULES: Array<{ tag: DigestTag; pattern: RegExp }> = [
  { tag: 'AI', pattern: /\b(ai|ia|artificial intelligence|intelligenza artificiale|chatgpt|gpt|gemini|claude|grok|llm|agent[si]?|agenti|assistant|prompt|generat(?:ion|ivo|iva|ive|ivi)|longcat|machine learning)\b/gu },
  { tag: 'Business', pattern: /\b(aziend[ae]|impres[ae]|business|startup|founder[sz]?|imprenditor[ei]|ristorant[ei]|ceo|client[ei]|appuntament[oi])\b/gu },
  { tag: 'Marketing', pattern: /\b(marketing|ads|advertising|pubblicit[aà]|facebook|instagram|campagn[ae]|social media|brand|content|contenut[oi])\b/gu },
  { tag: 'Tecnologia', pattern: /\b(tecnolog[ia]+|software|app|ios|iphone|siri|sito|website|web|search engine|motore di ricerca|codic[ei]|benchmark|developer[sz]?|cloud)\b/gu },
  { tag: 'Produttività', pattern: /\b(produttivit[aà]|productive?|automat(?:ico|ica|ici|iche|ion|ion[ei]|izzazion[ei])|tempo|ore|organizzazion[ei]|motivazion[ei]|entusiasmo|abitudin[ei]|successo)\b/gu },
  { tag: 'Video', pattern: /\b(video|filmat[oi]|youtube|reel[sz]?|short.form|film|clip)\b/gu },
  { tag: 'Musica', pattern: /\b(musica|music|canzon[ei]|spotify|audio|song[sz]?)\b/gu },
  { tag: 'Attualità', pattern: /\b(politic[ao]|centrosinistra|amministrazion[ei]|sindac[oi]|foggia|cronaca|elezion[ei]|governo|notizi[ae])\b/gu },
];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('und');
}

export function classifyDigestTags(title: string, description: string): DigestTag[] {
  const normalizedTitle = normalize(title);
  const normalizedDescription = normalize(description);
  const scores = RULES.map(({ tag, pattern }) => {
    pattern.lastIndex = 0;
    const titleMatches = [...normalizedTitle.matchAll(pattern)].length;
    pattern.lastIndex = 0;
    const descriptionMatches = [...normalizedDescription.matchAll(pattern)]
      .filter((match) => tag !== 'AI' || (match[0] !== 'ai' && match[0] !== 'ia')).length;
    return { tag, score: titleMatches * 2 + descriptionMatches };
  });
  const tags = scores.filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ tag }) => tag);
  return tags.length ? tags : ['Da verificare'];
}

export function parseDigestTags(value: unknown): DigestTag[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string' || !DIGEST_TAGS.includes(tag as DigestTag))) {
    throw new Error('Categorie non valide');
  }
  const tags = [...new Set(value as DigestTag[])];
  if (tags.length > 3) throw new Error('Puoi scegliere al massimo 3 categorie');
  return tags.length ? tags : ['Da verificare'];
}
