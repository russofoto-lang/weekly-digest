import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureContent,
  ContentCaptureError,
  extractArticleDataFromHtml,
  extractFallbackReadableHtml,
  extractYouTubeVideoId,
  isRedditUrl,
  isYouTubeUrl,
  MAX_READABLE_TEXT_LENGTH,
  normalizeUrl,
  sanitizeAndLimitReadableHtml,
} from './capture-content.js';

const substantialText =
  'Questo è un paragrafo sostanziale abbastanza lungo da essere mantenuto nel testo leggibile dell’articolo.';

function articleHtml(head: string, body = `<h1>Titolo Readability</h1><p>${substantialText}</p>`): string {
  return `<!doctype html><html><head>${head}</head><body><article>${body}</article></body></html>`;
}

test('riconosce tutti i formati YouTube e ne estrae uniformemente ID', () => {
  const urls = [
    'https://youtube.com/watch?v=video_123-AB',
    'https://youtu.be/video_123-AB',
    'https://www.youtube.com/shorts/video_123-AB',
    'https://youtube.com/live/video_123-AB?si=tracking',
    'https://youtube.com/embed/video_123-AB',
    'https://m.youtube.com/watch?v=video_123-AB',
    'https://m.youtube.com/shorts/video_123-AB',
    'https://m.youtube.com/live/video_123-AB',
    'https://m.youtube.com/embed/video_123-AB',
  ];

  for (const rawUrl of urls) {
    const url = new URL(rawUrl);
    assert.equal(isYouTubeUrl(url), true, rawUrl);
    assert.equal(extractYouTubeVideoId(url), 'video_123-AB', rawUrl);
    assert.equal(normalizeUrl(rawUrl), 'https://www.youtube.com/watch?v=video_123-AB');
  }
  assert.equal(isYouTubeUrl(new URL('https://example.com/live/video_123-AB')), false);
});

test('passa a oEmbed e salva sempre URL YouTube canonico', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  try {
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return Response.json({
        title: 'Video title',
        thumbnail_url: 'https://i.ytimg.com/vi/video123/hqdefault.jpg',
        author_name: 'Creator',
      });
    };

    const item = await captureContent('https://m.youtube.com/live/video123?si=abc&utm_source=x');
    assert.equal(item.url, 'https://www.youtube.com/watch?v=video123');
    assert.equal(new URL(requestedUrl).searchParams.get('url'), item.url);
    assert.equal(item.tipo, 'youtube');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('acquisisce i post Reddit tramite oEmbed senza richiedere testo leggibile', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  try {
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return Response.json({
        title: 'Titolo del post Reddit',
        author_name: 'utente_test',
        provider_name: 'reddit',
        thumbnail_url: 'https://preview.redd.it/example.jpg',
      });
    };

    const url = 'https://www.reddit.com/r/italy/comments/abc123/un_post/?utm_source=share';
    assert.equal(isRedditUrl(new URL(url)), true);
    const item = await captureContent(url);
    assert.equal(new URL(requestedUrl).pathname, '/oembed');
    assert.equal(item.url, 'https://www.reddit.com/r/italy/comments/abc123/un_post/');
    assert.equal(item.tipo, 'articolo');
    assert.equal(item.titolo, 'Titolo del post Reddit');
    assert.equal(item.descrizione, 'u/utente_test · reddit');
    assert.equal(item.testoLeggibile, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('usa la catena titolo og → twitter → document → Readability → hostname', async () => {
  const pageUrl = new URL('https://news.example.com/path');
  const openGraph = await extractArticleDataFromHtml(articleHtml(
    '<meta property="og:title" content="Titolo Open Graph"><title>Titolo documento</title>',
  ), pageUrl);
  assert.equal(openGraph.titolo, 'Titolo Open Graph');

  const twitter = await extractArticleDataFromHtml(articleHtml(
    '<meta property="og:title" content="undefined - sito">'
      + '<meta name="twitter:title" content="Titolo Twitter"><title>Titolo documento</title>',
  ), pageUrl);
  assert.equal(twitter.titolo, 'Titolo Twitter');

  const documentTitle = await extractArticleDataFromHtml(
    articleHtml('<meta name="twitter:title" content="null"><title>Titolo documento</title>'),
    pageUrl,
  );
  assert.equal(documentTitle.titolo, 'Titolo documento');

  const hostname = await extractArticleDataFromHtml(
    articleHtml('', `<h1>Titolo Readability</h1><p>${substantialText}</p>`),
    pageUrl,
  );
  assert.equal(hostname.titolo, 'news.example.com');

  for (const item of [openGraph, twitter, documentTitle, hostname]) {
    assert.doesNotMatch(item.titolo, /undefined|null/i);
  }
});

test('applica i fallback difensivi di descrizione e thumbnail', async () => {
  const pageUrl = new URL('https://example.com/news/story');
  const twitter = await extractArticleDataFromHtml(articleHtml(
    '<meta property="og:description" content="undefined">'
      + '<meta name="twitter:description" content="Descrizione Twitter">'
      + '<meta property="og:image" content="null">'
      + '<meta name="twitter:image" content="/twitter.jpg">',
  ), pageUrl);
  assert.equal(twitter.descrizione, 'Descrizione Twitter');
  assert.equal(twitter.thumbnail, 'https://example.com/twitter.jpg');

  const standard = await extractArticleDataFromHtml(articleHtml(
    '<meta name="description" content="Descrizione standard">',
    '<img src="/icon.png" width="32" height="32" alt="icon">'
      + '<img src="/main.jpg" width="800" height="450" alt="Foto principale">'
      + `<h1>Titolo</h1><p>${substantialText}</p>`,
  ), pageUrl);
  assert.equal(standard.descrizione, 'Descrizione standard');
  assert.equal(standard.thumbnail, 'https://example.com/main.jpg');

  const readability = await extractArticleDataFromHtml(
    articleHtml('', `<h1>Titolo</h1><p>${substantialText.repeat(3)}</p>`),
    pageUrl,
  );
  assert.equal(readability.descrizione, substantialText.repeat(3).slice(0, 200));
  assert.equal(readability.thumbnail, '');
  assert.doesNotMatch(readability.descrizione, /undefined|null/i);
});

test('normalizza tracking mantenendo gli altri parametri complessi', () => {
  const normalized = new URL(normalizeUrl(
    'https://example.com/path?utm_source=news&UTM_campaign=x&fbclid=abc&gclid=def&ocid=1&cvid=2&cvpid=3&ei=4&ref=home&si=5&filter=a%2Bb%26c&tags=uno%2Cdue&page=2',
  ));

  assert.equal(normalized.searchParams.get('filter'), 'a+b&c');
  assert.equal(normalized.searchParams.get('tags'), 'uno,due');
  assert.equal(normalized.searchParams.get('page'), '2');
  for (const key of normalized.searchParams.keys()) {
    assert.doesNotMatch(key, /^utm_|^(fbclid|gclid|ocid|cvid|cvpid|ei|ref|si)$/i);
  }
});

test('converte errori con query complesse in ContentCaptureError da 422', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError('network exploded');
    };
    await assert.rejects(
      () => captureContent('https://example.com/path?filter=%28a%2Bb%29%26x%3D1&keep=%5B1%2C2%5D'),
      (error: unknown) => error instanceof ContentCaptureError
        && /URL non raggiungibile/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.throws(
    () => normalizeUrl(`https://example.com/?keep=${'a'.repeat(1_600)}`),
    (error: unknown) => error instanceof ContentCaptureError
      && /troppo lungo/.test(error.message),
  );
});

test('rimuove i paragrafi brevi prima del primo paragrafo sostanziale', () => {
  const result = sanitizeAndLimitReadableHtml(
    `<p>Caricamento player</p><p>Pubblicità</p><p>${substantialText}</p><p>Fine.</p>`,
  );
  assert.doesNotMatch(result.testo, /Caricamento player|Pubblicità/);
  assert.match(result.testo, new RegExp(substantialText));
  assert.match(result.testo, /Fine\./);
});

test('fallback ANSA estrae news-txt e scarta cookie, paywall e pubblicità', () => {
  const firstParagraph =
    'Questo è il primo paragrafo della notizia ANSA, sufficientemente lungo e ricco di informazioni utili.';
  const secondParagraph =
    'Questo è il secondo paragrafo della notizia e contiene altri dettagli importanti per chi legge il digest.';
  const html = `<!doctype html><html><body>
    <div class="prompt-to-accept__wrapper">
      <p>Se accetti tutti i cookie di profilazione e tracciamento puoi continuare.</p>
    </div>
    <article>
      <div class="post-single-text rich-text news-txt">
        <h1>Titolo ANSA</h1>
        <div class="advertisement"><p>Pubblicità e contenuti sponsorizzati da non includere.</p></div>
        <p>${firstParagraph}</p>
        <p>${secondParagraph}</p>
        <p>Riproduzione riservata</p>
      </div>
    </article>
  </body></html>`;

  const result = extractFallbackReadableHtml(html);
  assert.ok(result);
  assert.equal(result.titolo, 'Titolo ANSA');
  assert.match(result.testo, new RegExp(firstParagraph));
  assert.match(result.testo, new RegExp(secondParagraph));
  assert.doesNotMatch(result.testo, /cookie|Pubblicità|Riproduzione riservata/i);
});

test('fallback non salva un banner cookie come contenuto articolo', () => {
  const result = extractFallbackReadableHtml(`<!doctype html><html><body><main>
    <p>Se accetti tutti i cookie di profilazione e tracciamento puoi leggere i contenuti.</p>
    <p>Abbonati per continuare a leggere questo articolo e tutti gli approfondimenti.</p>
  </main></body></html>`);

  assert.equal(result, null);
});

test('estrae il corpo NewsArticle dai dati JSON-LD delle pagine dinamiche', () => {
  const firstParagraph =
    'La Norvegia ha un nuovo re e questo paragrafo contiene informazioni sufficienti per essere acquisito.';
  const secondParagraph =
    'Il nuovo sovrano assumerà i propri compiti istituzionali nei prossimi giorni insieme alla famiglia reale.';
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: 'Haakon è il nuovo re di Norvegia',
    articleBody: `${firstParagraph}\n\n${secondParagraph}`,
  })}</script>
  </head><body><main><div id="app"></div></main></body></html>`;

  const result = extractFallbackReadableHtml(html);
  assert.ok(result);
  assert.equal(result.titolo, 'Haakon è il nuovo re di Norvegia');
  assert.match(result.testo, new RegExp(firstParagraph));
  assert.match(result.testo, new RegExp(secondParagraph));
  assert.match(result.testo, /<p>/);
});

test('estrae il payload JSON applicativo più sostanziale e lo sanitizza', () => {
  const body = `<p onclick="alert(1)">${substantialText}</p><p>${substantialText}</p>`;
  const html = `<!doctype html><html><body><div id="app"></div>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      teaser: { title: 'Teaser', content: 'Testo troppo breve.' },
      article: { title: 'Titolo MSN', body },
    },
  })}</script>
  </body></html>`;

  const result = extractFallbackReadableHtml(html);
  assert.ok(result);
  assert.equal(result.titolo, 'Titolo MSN');
  assert.match(result.testo, new RegExp(substantialText));
  assert.doesNotMatch(result.testo, /onclick|alert/);
});

test('estrae il contenuto completo Next Flight nella lingua della pagina', async () => {
  const french = `<p>${'Contenu français plus long qui ne doit pas être choisi. '.repeat(12)}</p>`;
  const english = `<p>${substantialText}</p><h2>Complete section</h2>`
    + `<p>${'This paragraph appears only in the complete English article body. '.repeat(5)}</p>`;
  const flightChunk = (id: string, value: string): string =>
    `${id}:T${Buffer.byteLength(value, 'utf8').toString(16)},${value}`;
  const stream = flightChunk('56', french)
    + flightChunk('57', english)
    + '58:{"content":"$56","contentEN":"$57"}';
  const script = `self.__next_f.push(${JSON.stringify([1, stream])})`;
  const html = `<!doctype html><html lang="en"><head><title>CodeWeb</title></head><body>
    <main><article><p>${substantialText}</p></article></main>
    <script>${script}</script>
  </body></html>`;

  const result = await extractArticleDataFromHtml(html, new URL('https://codeweb.example/article'));
  assert.match(result.testoLeggibile ?? '', /Complete section/);
  assert.match(result.testoLeggibile ?? '', /complete English article body/);
  assert.doesNotMatch(result.testoLeggibile ?? '', /Contenu français/);
});

test('sanitizza HTML Readability con la allowlist richiesta', () => {
  const result = sanitizeAndLimitReadableHtml(
    `<article onclick="alert(1)"><h1>Titolo</h1><p>${substantialText} <strong>Utile</strong></p>`
      + '<script>alert(1)</script><iframe src="https://evil.example"></iframe>'
      + '<a href="https://example.com" onmouseover="alert(2)">link</a>'
      + '<img src="https://example.com/a.jpg" alt="Cover" width="99"></article>',
  );

  assert.equal(result.troncato, false);
  assert.match(result.testo, /<h1>Titolo<\/h1>/);
  assert.match(result.testo, /href="https:\/\/example.com"/);
  assert.match(result.testo, /src="https:\/\/example.com\/a.jpg" alt="Cover"/);
  assert.doesNotMatch(result.testo, /script|iframe|onclick|onmouseover|width=/);
});

test('tronca il contenuto sanificato a 500.000 caratteri', () => {
  const result = sanitizeAndLimitReadableHtml(`<p>${'a'.repeat(MAX_READABLE_TEXT_LENGTH)}</p>`);
  assert.equal(result.troncato, true);
  assert.equal(result.testo.length, MAX_READABLE_TEXT_LENGTH);
});
