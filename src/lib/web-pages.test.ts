import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  renderArchivePage,
  renderArticlePage,
  renderDigestPage,
  renderErrorPage,
  renderSearchPage,
  renderCategoriesPage,
  renderCategoryPage,
  renderFavoritesPage,
  renderReadingListPage,
} from './web-pages.js';
import type { DigestItem } from '../types/digest-item.js';

function item(overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    id: 'articolo-1',
    url: 'https://example.com/originale?a=1&b=2',
    tipo: 'articolo',
    titolo: 'Titolo <speciale>',
    descrizione: 'Una descrizione',
    thumbnail: 'https://example.com/image.jpg',
    testoLeggibile: '<p>Testo <strong>sanificato</strong>.</p>',
    durata: null,
    dataAggiunta: Timestamp.now(),
    stato: 'archiviato',
    settimana: '2026-W35',
    ...overrides,
  };
}

test('renderizza la pagina articolo pubblica con layout reader e nota troncamento', () => {
  const html = renderArticlePage(item({ troncato: true }));

  assert.match(html, /<h1>Titolo &lt;speciale&gt;<\/h1>/);
  assert.match(html, /<p>Testo <strong>sanificato<\/strong>\.<\/p>/);
  assert.match(html, /max-width:680px/);
  assert.match(html, /font-size:18px/);
  assert.match(html, /line-height:1\.7/);
  assert.match(html, /href="\/"/);
  assert.match(html, /Testo troncato — apri l’originale per il resto/);
  assert.match(html, /https:\/\/example\.com\/originale\?a=1&amp;b=2/);
  assert.match(html, /data-translate-id="articolo-1">Traduci in italiano<\/button>/);
  assert.match(html, /method: 'POST'/);
  assert.match(html, /\/traduci'/);
});

test('renderizza e permette di chiudere la traduzione italiana memorizzata', () => {
  const html = renderArticlePage(item({
    titoloTradotto: 'Titolo tradotto',
    testoTradotto: '<p>Testo tradotto.</p>',
    linguaTraduzione: 'it',
  }), true);

  assert.match(html, /<h1>Titolo tradotto<\/h1>/);
  assert.match(html, /<p>Testo tradotto\.<\/p>/);
  assert.match(html, /href="\/leggi\/articolo-1">Mostra originale<\/a>/);
  assert.doesNotMatch(html, /data-translate-id/);
});

test('renderizza una pagina HTML coerente per gli errori pubblici', () => {
  const html = renderErrorPage(500);
  assert.match(html, /Errore 500/);
  assert.match(html, /Qualcosa è andato storto/);
  assert.match(html, /Non è stato possibile caricare questa pagina/);
  assert.match(html, /href="\/">← Torna al digest<\/a>/);
});

test('renderizza card mobile-first con link diversi per articolo e video', () => {
  const html = renderDigestPage('2026-W35', [
    item(),
    item({ id: 'video-1', tipo: 'youtube', url: 'https://youtu.be/abc', titolo: 'Video' }),
  ]);

  assert.match(html, /href="\/leggi\/articolo-1"/);
  assert.match(html, /href="https:\/\/youtu\.be\/abc"/);
  assert.match(html, /24 agosto 2026 – 30 agosto 2026/);
  assert.match(html, /2 salvataggi · 1 articolo · 1 video/);
  assert.doesNotMatch(html.replace('href="/settimana/2026-W35"', ''), />2026-W35</);
  assert.match(html, /grid-template-columns:72px minmax\(0,1fr\)/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /href="\/archivio"/);
  assert.doesNotMatch(html, /Titolo <speciale>/);
});

test('ordina e collega le settimane ricevute nella pagina archivio', () => {
  const html = renderArchivePage(['2026-W35', '2026-W34']);
  assert.ok(html.indexOf('24 agosto 2026') < html.indexOf('17 agosto 2026'));
  assert.match(html, /24 agosto 2026 – 30 agosto 2026/);
  assert.match(html, /17 agosto 2026 – 23 agosto 2026/);
  assert.match(html, /href="\/settimana\/2026-W35"/);
});

test('gestisce il singolare nel riepilogo web', () => {
  const articleHtml = renderDigestPage('2026-W35', [item()]);
  assert.match(articleHtml, /1 salvataggio · 1 articolo · 0 video/);

  const videoHtml = renderDigestPage('2026-W35', [item({ tipo: 'youtube' })]);
  assert.match(videoHtml, /1 salvataggio · 0 articoli · 1 video/);
});

test('mostra il cestino e protegge DELETE con il token memorizzato', () => {
  const publicHtml = renderDigestPage('2026-W35', [item()]);
  assert.match(publicHtml, /class="delete-button"[^>]+data-delete-id="articolo-1"/);
  assert.match(publicHtml, /aria-label="Elimina Titolo &lt;speciale&gt;">🗑<\/button>/);
  assert.match(publicHtml, /method: 'DELETE'/);
  assert.match(publicHtml, /if \(!requireToken\(null\)\) return/);
  assert.match(publicHtml, /'X-Digest-Token': digestToken/);

  const adminHtml = renderDigestPage('2026-W35', [item()], 'secret-token');
  assert.match(adminHtml, /href="\/archivio\?admin=secret-token"/);
});

test('permette di aggiungere e rimuovere un preferito', () => {
  const html = renderDigestPage('2026-W35', [item()]);
  assert.match(html, /class="favorite-button"[^>]+data-favorite-id="articolo-1"/);
  assert.match(html, />☆<\/button>/);
  assert.match(html, /\/preferito'/);
  assert.match(html, /method: 'POST'/);
  assert.match(html, /button\.textContent = favorite \? '★' : '☆'/);

  const favorites = renderFavoritesPage([item({ preferito: true })]);
  assert.match(favorites, /<h1>Preferiti<\/h1>/);
  assert.match(favorites, /data-favorite="true"/);
  assert.match(favorites, />★<\/button>/);
  assert.match(renderFavoritesPage([]), /Non hai ancora aggiunto preferiti/);
});

test('mostra una navigazione coerente, stato di lettura e nota personale', () => {
  const html = renderDigestPage('2026-W35', [item({ notaPersonale: 'Da usare per i clienti' })]);
  assert.match(html, /aria-label="Navigazione principale"/);
  assert.match(html, /Raccolta/);
  assert.match(html, /href="\/da-leggere"/);
  assert.match(html, /data-read-id="articolo-1"/);
  assert.match(html, /\/letto'/);
  assert.match(html, /Da usare per i clienti/);
  assert.match(html, /name="notaPersonale"/);
  assert.match(html, /notaPersonale: form\.elements\.notaPersonale\.value/);
  assert.match(renderReadingListPage([]), /Hai letto tutti i link salvati/);
});

test('permette di modificare i dettagli di ogni link', () => {
  const html = renderDigestPage('2026-W35', [item()]);

  assert.match(html, /data-edit-id="articolo-1"/);
  assert.match(html, /data-edit-title="Titolo &lt;speciale&gt;"/);
  assert.match(html, /<dialog class="edit-dialog" data-edit-dialog>/);
  assert.match(html, /fetch\('\/digest-items\/' \+ encodeURIComponent\(form\.elements\.id\.value\)/);
  assert.match(html, /method: 'PATCH'/);
  assert.match(html, /titolo: form\.elements\.titolo\.value/);
  assert.match(html, /descrizione: form\.elements\.descrizione\.value/);
  assert.match(html, /thumbnail: form\.elements\.thumbnail\.value/);
  assert.match(html, /Modifiche salvate/);
});

test('mostra il modulo per aggiungere link direttamente nella homepage', () => {
  const publicHtml = renderDigestPage('2026-W35', [item()]);
  assert.match(publicHtml, /<form class="add-form" data-add-form>/);
  assert.match(publicHtml, /Incolla un link/);
  assert.match(publicHtml, /name="url" type="url"/);
  assert.match(publicHtml, /fetch\('\/digest-items'/);
  assert.match(publicHtml, /method: 'POST'/);
  assert.match(publicHtml, /'X-Digest-Token': digestToken/);
  assert.match(publicHtml, /JSON\.stringify\(\{ url: input\.value \}\)/);
  assert.match(publicHtml, /window\.localStorage\.getItem\(tokenStorageKey\)/);
  assert.match(publicHtml, /window\.prompt\('Inserisci il token del digest/);
  assert.match(publicHtml, /Link aggiunto al prossimo digest/);
  assert.match(publicHtml, /window\.setTimeout\(\(\) => window\.location\.reload\(\), 700\)/);
  assert.match(publicHtml, /<summary>Inserisci manualmente<\/summary>/);
  assert.match(publicHtml, /data-manual-form/);
  assert.match(publicHtml, /fetch\('\/digest-items\/manuale'/);
  assert.match(publicHtml, /name="titolo" type="text"/);
  assert.match(publicHtml, /name="descrizione"/);
  assert.match(publicHtml, /name="thumbnail" type="url"/);
  assert.match(publicHtml, /manualDetails\.open = true/);
});

test('permette di aggiungere link anche prima del primo digest', () => {
  const html = renderDigestPage(null, []);
  assert.match(html, /data-add-form/);
  assert.match(html, /href="\/archivio"/);
});

test('mostra subito gli elementi pending nella sezione Prossimo digest', () => {
  const pendingArticle = item({
    id: 'pending-1',
    stato: 'pending',
    titolo: 'Articolo appena salvato',
  });
  const html = renderDigestPage('2026-W35', [item()], null, [pendingArticle]);

  assert.match(html, /In arrivo/);
  assert.match(html, /id="pending-title">Prossimo digest<\/h2>/);
  assert.match(html, /Articolo appena salvato/);
  assert.match(html, /href="\/leggi\/pending-1"/);
});

test('un elemento manuale senza testo apre direttamente URL originale', () => {
  const manualItem = item({
    id: 'manuale-1',
    url: 'https://www.reddit.com/r/italy/comments/abc123/post/',
    testoLeggibile: null,
    stato: 'pending',
  });
  const html = renderDigestPage('2026-W35', [item()], null, [manualItem]);

  assert.match(html, /href="https:\/\/www\.reddit\.com\/r\/italy\/comments\/abc123\/post\/"/);
  assert.doesNotMatch(html, /href="\/leggi\/manuale-1"/);
});

test('mostra i pending anche se non esiste ancora un digest archiviato', () => {
  const html = renderDigestPage(null, [], null, [item({ stato: 'pending' })]);
  assert.match(html, /Prossimo digest/);
  assert.doesNotMatch(html, /Non ci sono ancora elementi archiviati/);
});

test('preserva la modalita admin navigando dall archivio', () => {
  const html = renderArchivePage(['2026-W35'], 'secret token');
  assert.match(html, /href="\/settimana\/2026-W35\?admin=secret%20token"/);
  assert.match(html, /href="\/\?admin=secret%20token"/);
});

test('mostra la ricerca nell archivio e i risultati con la corrispondenza', () => {
  const archive = renderArchivePage(['2026-W35']);
  assert.match(archive, /action="\/cerca" method="get" role="search"/);
  const results = renderSearchPage('ai aziende piccole', {
    items: [item()], matchedWords: 2, totalWords: 3, translationUnavailable: false,
  });
  assert.match(results, /value="ai aziende piccole"/);
  assert.match(results, /2 parole trovate su 3/);
  assert.match(results, /Titolo &lt;speciale&gt;/);
});

test('mostra categorie navigabili e permette di correggere quelle di un link', () => {
  const tagged = item({ tags: ['AI', 'Business'] });
  const overview = renderCategoriesPage(new Map([['AI', 1], ['Business', 1]]));
  assert.match(overview, /href="\/categoria\/AI"/);
  const page = renderCategoryPage('AI', [tagged]);
  assert.match(page, /data-edit-tags="AI\|Business"/);
  assert.match(page, /name="tags" type="checkbox" value="AI"/);
  assert.match(page, /tags: \[\.\.\.form\.querySelectorAll/);
  assert.match(page, /href="\/categoria\/Business"/);
});
