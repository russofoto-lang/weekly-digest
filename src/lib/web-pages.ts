import type { DigestItem } from '../types/digest-item.js';
import { DIGEST_TAGS, type DigestTag } from './digest-tags.js';
import { formatDigestSummary } from './digest-summary.js';
import { formatIsoWeekDateRange } from './iso-week.js';
import type { SearchResult } from './search-items.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pageShell(title: string, content: string, mode: 'ui' | 'reader' = 'ui'): string {
  const readerStyles = mode === 'reader'
    ? `
      body { background:#faf9f6; color:#27231f; font-family:Georgia,'Times New Roman',serif; }
      .reader { width:100%; max-width:680px; margin:0 auto; padding:24px 18px 56px; }
      .reader h1 { margin:30px 0 24px; font-size:clamp(2rem,8vw,3.25rem); line-height:1.08; letter-spacing:-.025em; }
      .article-body { font-size:18px; line-height:1.7; overflow-wrap:anywhere; }
      .article-body img, .article-body figure { max-width:100%; height:auto; }
      .article-body a { color:#855b37; }
      .reader-nav, .reader-footer { font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:14px; }
      .translation-controls { display:flex; align-items:center; gap:10px; margin:18px 0 0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:13px; }
      .translate-button { padding:8px 11px; color:#fff; background:#6f4d31; border:0; border-radius:7px; font:inherit; font-weight:700; cursor:pointer; }
      .translate-button:disabled { cursor:wait; opacity:.65; }
      .translation-status { color:#756c62; }
      .reader-footer { margin-top:42px; padding-top:22px; border-top:1px solid #ddd7ce; }
      .truncated-note { color:#756c62; font-style:italic; }
    `
    : `
      body { background:#f6f5f2; color:#222; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      .shell { width:100%; max-width:760px; margin:0 auto; padding:28px 16px 56px; }
      .eyebrow { margin:0 0 8px; color:#746d64; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2rem,9vw,3.5rem); line-height:1; letter-spacing:-.045em; }
      .summary { margin:12px 0 28px; color:#6a645c; font-size:15px; }
      .add-form { display:grid; gap:10px; margin:0 0 24px; padding:14px; background:#fff; border:1px solid #dedbd5; border-radius:12px; }
      .search-form { display:grid; gap:8px; margin:20px 0 24px; padding:14px; background:#fff; border:1px solid #dedbd5; border-radius:12px; }
      .search-form label { font-size:13px; font-weight:700; }
      .search-form .add-row input { width:100%; }
      .search-note { margin:0 0 16px; color:#6a645c; font-size:14px; }
      .add-form label { font-size:13px; font-weight:700; }
      .add-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
      .add-row input { min-width:0; padding:11px 12px; border:1px solid #c9c4bc; border-radius:8px; font:inherit; font-size:16px; }
      .add-row button { padding:11px 15px; color:#fff; background:#2e2b27; border:0; border-radius:8px; font:inherit; font-weight:700; cursor:pointer; }
      .add-row button:disabled { cursor:wait; opacity:.6; }
      .add-status { min-height:18px; margin:0; color:#625c54; font-size:13px; }
      .add-status[data-error="true"] { color:#9a3f35; }
      .manual-entry { margin:-14px 0 24px; color:#625c54; font-size:13px; }
      .manual-entry summary { width:max-content; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
      .manual-form { display:grid; gap:12px; margin-top:12px; padding:14px; background:#fff; border:1px solid #dedbd5; border-radius:12px; }
      .manual-form label { display:grid; gap:5px; color:#302d29; font-weight:700; }
      .manual-form input, .manual-form textarea { width:100%; padding:10px 11px; border:1px solid #c9c4bc; border-radius:8px; font:inherit; font-size:16px; font-weight:400; resize:vertical; }
      .manual-form button { justify-self:start; padding:10px 14px; color:#fff; background:#2e2b27; border:0; border-radius:8px; font:inherit; font-weight:700; cursor:pointer; }
      .pending-section { margin:28px 0; padding:22px 0; border-top:1px solid #dedbd5; border-bottom:1px solid #dedbd5; }
      .section-title { margin:0 0 6px; font-size:22px; line-height:1.2; letter-spacing:-.02em; }
      .section-summary { margin:0 0 16px; color:#6a645c; font-size:14px; }
      .cards { display:grid; gap:12px; }
      .card { position:relative; display:grid; grid-template-columns:72px minmax(0,1fr); gap:14px; padding:13px; color:inherit; background:#fff; border:1px solid #dedbd5; border-radius:12px; transition:border-color .15s ease,transform .15s ease; }
      .card:hover { border-color:#aaa39a; transform:translateY(-1px); }
      .card-link { position:absolute; z-index:1; inset:0; border-radius:12px; }
      .thumb { width:72px; height:72px; border-radius:8px; object-fit:cover; background:#e9e6df; }
      .card-copy { min-width:0; padding-right:30px; }
      .badge { display:inline-block; margin:0 0 6px; padding:2px 7px; border-radius:999px; color:#665f56; background:#eeeae3; font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
      .card h2 { margin:0 0 4px; font-size:17px; line-height:1.25; }
      .card p { display:-webkit-box; overflow:hidden; margin:0; color:#6b655d; font-size:14px; line-height:1.4; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
      .card-tags { position:relative; z-index:2; display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
      .card-tags a { padding:3px 7px; color:#5f574d; background:#f1ede7; border-radius:999px; font-size:11px; font-weight:700; text-decoration:none; }
      .card-tags a:hover { background:#e4ded4; }
      .tag-choices { display:flex; flex-wrap:wrap; gap:7px; padding:0; border:0; }
      .tag-choices legend { margin-bottom:7px; font-size:13px; font-weight:700; }
      .edit-form .tag-choices label { display:flex; align-items:center; gap:5px; padding:7px 9px; border:1px solid #dedbd5; border-radius:8px; font-size:12px; }
      .edit-form .tag-choices input { width:auto; }
      .category-link { display:flex; justify-content:space-between; padding:14px 16px; color:#222; background:#fff; border:1px solid #dedbd5; border-radius:10px; font-weight:700; text-decoration:none; }
      .delete-button { position:absolute; z-index:2; top:10px; right:10px; display:grid; width:30px; height:30px; padding:0; place-items:center; color:#756d64; background:transparent; border:0; border-radius:7px; font-size:16px; line-height:1; cursor:pointer; }
      .delete-button:hover { color:#9a3f35; background:#f4e9e7; }
      .edit-button { position:absolute; z-index:2; right:43px; bottom:10px; padding:5px 8px; color:#625c54; background:#f4f1eb; border:0; border-radius:7px; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
      .edit-button:hover { color:#222; background:#e9e4dc; }
      .edit-dialog { width:min(560px,calc(100% - 24px)); padding:0; border:0; border-radius:14px; box-shadow:0 20px 60px #0004; }
      .edit-dialog::backdrop { background:#29262199; }
      .edit-form { display:grid; gap:12px; padding:20px; }
      .edit-form h2 { margin:0 0 4px; }
      .edit-form label { display:grid; gap:5px; font-size:13px; font-weight:700; }
      .edit-form input, .edit-form textarea { width:100%; padding:10px 11px; border:1px solid #c9c4bc; border-radius:8px; font:inherit; font-size:16px; font-weight:400; resize:vertical; }
      .edit-actions { display:flex; justify-content:flex-end; gap:8px; }
      .edit-actions button { padding:9px 13px; border:0; border-radius:8px; font:inherit; font-weight:700; cursor:pointer; }
      .edit-actions button[type="submit"] { color:#fff; background:#2e2b27; }
      .footer-link { display:inline-block; margin-top:28px; color:#4d4842; font-size:14px; font-weight:650; }
      .weeks { display:grid; gap:10px; margin-top:28px; }
      .week-link { display:flex; align-items:center; justify-content:space-between; padding:17px 18px; color:#222; text-decoration:none; background:#fff; border:1px solid #dedbd5; border-radius:10px; font-weight:700; }
      .empty { margin:28px 0; padding:24px; color:#6b655d; background:#fff; border:1px solid #dedbd5; border-radius:12px; }
      @media (min-width:600px) { .shell { padding-top:48px; } .card { padding:16px; } }
    `;

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing:border-box; }
      html, body { margin:0; min-height:100%; }
      a { text-underline-offset:3px; }
      ${readerStyles}
    </style>
  </head>
  <body>${content}</body>
</html>`;
}

function itemHref(item: DigestItem): string {
  return item.tipo === 'articolo' && item.testoLeggibile
    ? `/leggi/${encodeURIComponent(item.id)}`
    : item.url;
}

function renderCard(item: DigestItem): string {
  const thumbnail = item.thumbnail
    ? `<img class="thumb" src="${escapeHtml(item.thumbnail)}" alt="" width="72" height="72" loading="lazy" />`
    : '<span class="thumb" aria-hidden="true"></span>';
  const badge = item.tipo === 'youtube' ? 'video' : 'articolo';
  const tags = (item.tags ?? []).map((tag) => `<a href="/categoria/${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`).join('');
  const deleteButton = `<button class="delete-button" type="button" data-delete-id="${escapeHtml(item.id)}" title="Elimina" aria-label="Elimina ${escapeHtml(item.titolo)}">🗑</button>`;
  const editButton = `<button class="edit-button" type="button" data-edit-id="${escapeHtml(item.id)}" data-edit-url="${escapeHtml(item.url)}" data-edit-title="${escapeHtml(item.titolo)}" data-edit-description="${escapeHtml(item.descrizione)}" data-edit-thumbnail="${escapeHtml(item.thumbnail)}" data-edit-tags="${escapeHtml((item.tags ?? []).join('|'))}">Modifica</button>`;

  return `<article class="card">
    <a class="card-link" href="${escapeHtml(itemHref(item))}" aria-label="Apri ${escapeHtml(item.titolo)}"></a>
    ${deleteButton}
    ${editButton}
    ${thumbnail}
    <span class="card-copy">
      <span class="badge">${badge}</span>
      <h2>${escapeHtml(item.titolo)}</h2>
      <p>${escapeHtml(item.descrizione)}</p>
      ${tags ? `<span class="card-tags">${tags}</span>` : ''}
    </span>
  </article>`;
}

function renderEditDialog(): string {
  return `<dialog class="edit-dialog" data-edit-dialog>
    <form class="edit-form" data-edit-form>
      <h2>Modifica link</h2>
      <input name="id" type="hidden" />
      <label>URL
        <input name="url" type="url" inputmode="url" autocomplete="url" required />
      </label>
      <label>Titolo
        <input name="titolo" type="text" maxlength="500" required />
      </label>
      <label>Descrizione <span>(facoltativa)</span>
        <textarea name="descrizione" rows="4" maxlength="5000"></textarea>
      </label>
      <label>URL thumbnail <span>(facoltativo)</span>
        <input name="thumbnail" type="url" inputmode="url" autocomplete="url" />
      </label>
      <fieldset class="tag-choices">
        <legend>Categorie (massimo 3)</legend>
        ${DIGEST_TAGS.map((tag) => `<label><input name="tags" type="checkbox" value="${escapeHtml(tag)}" />${escapeHtml(tag)}</label>`).join('')}
      </fieldset>
      <p class="add-status" data-edit-status aria-live="polite"></p>
      <div class="edit-actions">
        <button type="button" data-edit-cancel>Annulla</button>
        <button type="submit">Salva modifiche</button>
      </div>
    </form>
  </dialog>`;
}

function adminQuery(adminToken: string | null): string {
  return adminToken ? `?admin=${encodeURIComponent(adminToken)}` : '';
}

function renderAddForm(): string {
  return `<form class="add-form" data-add-form>
    <label for="digest-url">Incolla un link</label>
    <span class="add-row">
      <input id="digest-url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://…" required />
      <button type="submit">Aggiungi</button>
    </span>
    <p class="add-status" data-add-status aria-live="polite"></p>
  </form>
  <details class="manual-entry" data-manual-details>
    <summary>Inserisci manualmente</summary>
    <form class="manual-form" data-manual-form>
      <label>URL
        <input name="url" type="url" inputmode="url" autocomplete="url" required />
      </label>
      <label>Titolo
        <input name="titolo" type="text" maxlength="500" required />
      </label>
      <label>Descrizione <span>(facoltativa)</span>
        <textarea name="descrizione" rows="3" maxlength="5000"></textarea>
      </label>
      <label>URL thumbnail <span>(facoltativo)</span>
        <input name="thumbnail" type="url" inputmode="url" autocomplete="url" />
      </label>
      <button type="submit">Salva manualmente</button>
      <p class="add-status" data-manual-status aria-live="polite"></p>
    </form>
  </details>`;
}

function renderSearchForm(query = '', adminToken: string | null = null): string {
  return `<form class="search-form" action="/cerca" method="get" role="search">
    <label for="search-query">Cerca in titolo e descrizione</label>
    <span class="add-row">
      <input id="search-query" name="q" type="search" value="${escapeHtml(query)}" maxlength="200" placeholder="Es. ai aziende piccole" required />
      <button type="submit">Cerca</button>
    </span>
    ${adminToken ? `<input type="hidden" name="admin" value="${escapeHtml(adminToken)}" />` : ''}
  </form>`;
}

function renderPendingSection(items: DigestItem[]): string {
  if (items.length === 0) return '';
  return `<section class="pending-section" aria-labelledby="pending-title">
    <p class="eyebrow">Disponibili subito</p>
    <h2 class="section-title" id="pending-title">Da leggere</h2>
    <p class="section-summary">${escapeHtml(formatDigestSummary(items))}</p>
    <div class="cards">${items.map((item) => renderCard(item)).join('')}</div>
  </section>`;
}

function pageScript(): string {
  const editBehavior = `
    const editDialog = document.querySelector('[data-edit-dialog]');
    const editForm = document.querySelector('[data-edit-form]');
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-id]');
      if (!button) return;
      event.preventDefault();
      editForm.elements.id.value = button.dataset.editId;
      editForm.elements.url.value = button.dataset.editUrl || '';
      editForm.elements.titolo.value = button.dataset.editTitle || '';
      editForm.elements.descrizione.value = button.dataset.editDescription || '';
      editForm.elements.thumbnail.value = button.dataset.editThumbnail || '';
      const selectedTags = new Set((button.dataset.editTags || '').split('|'));
      editForm.querySelectorAll('[name="tags"]').forEach((input) => { input.checked = selectedTags.has(input.value); });
      editForm.querySelector('[data-edit-status]').textContent = '';
      editDialog.showModal();
    });
    document.querySelector('[data-edit-cancel]')?.addEventListener('click', () => editDialog.close());
    editForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = form.querySelector('[data-edit-status]');
      const button = form.querySelector('button[type="submit"]');
      if (!requireToken(status)) return;
      button.disabled = true;
      status.dataset.error = 'false';
      status.textContent = 'Salvataggio in corso…';
      try {
        const response = await fetch('/digest-items/' + encodeURIComponent(form.elements.id.value), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Digest-Token': digestToken
          },
          body: JSON.stringify({
            url: form.elements.url.value,
            titolo: form.elements.titolo.value,
            descrizione: form.elements.descrizione.value,
            thumbnail: form.elements.thumbnail.value,
            tags: [...form.querySelectorAll('[name="tags"]:checked')].map((input) => input.value)
          })
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          forgetInvalidToken();
          throw new Error('Token non valido. Riprova e inserisci quello corretto.');
        }
        if (!response.ok) throw new Error(result.error || 'Modifica non riuscita');
        status.textContent = 'Modifiche salvate.';
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        status.dataset.error = 'true';
        status.textContent = error instanceof Error ? error.message : 'Modifica non riuscita';
      } finally {
        button.disabled = false;
      }
    });`;
  const deleteBehavior = `
    document.addEventListener('click', async (event) => {
      const link = event.target.closest('[data-delete-id]');
      if (!link) return;
      event.preventDefault();
      if (!window.confirm('Eliminare questo elemento?')) return;
      if (!requireToken(null)) return;
      const response = await fetch('/digest-items/' + encodeURIComponent(link.dataset.deleteId), {
        method: 'DELETE',
        headers: { 'X-Digest-Token': digestToken }
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) forgetInvalidToken();
        window.alert(result.error || 'Eliminazione non riuscita');
        return;
      }
      window.location.reload();
    });`;

  return `<script>
    const tokenStorageKey = 'weekly-digest-token';
    const queryToken = new URLSearchParams(window.location.search).get('admin');
    let digestToken = queryToken || '';
    try {
      digestToken = digestToken || window.localStorage.getItem(tokenStorageKey) || '';
      if (queryToken) window.localStorage.setItem(tokenStorageKey, queryToken);
    } catch {}

    function requireToken(status) {
      if (digestToken) return true;
      const enteredToken = window.prompt('Inserisci il token del digest. Verrà ricordato solo su questo browser.');
      if (!enteredToken?.trim()) {
        if (status) {
          status.dataset.error = 'true';
          status.textContent = 'Token necessario per continuare.';
        }
        return false;
      }
      digestToken = enteredToken.trim();
      try { window.localStorage.setItem(tokenStorageKey, digestToken); } catch {}
      return true;
    }

    function forgetInvalidToken() {
      digestToken = '';
      try { window.localStorage.removeItem(tokenStorageKey); } catch {}
    }

    document.querySelector('[data-add-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.elements.url;
      const button = form.querySelector('button');
      const status = form.querySelector('[data-add-status]');
      if (!requireToken(status)) return;
      button.disabled = true;
      status.dataset.error = 'false';
      status.textContent = 'Acquisizione del contenuto in corso…';

      try {
        const response = await fetch('/digest-items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Digest-Token': digestToken
          },
          body: JSON.stringify({ url: input.value })
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          forgetInvalidToken();
          throw new Error('Token non valido. Riprova e inserisci quello corretto.');
        }
        if (!response.ok) throw new Error(result.error || 'Inserimento non riuscito');
        status.textContent = result.duplicate
          ? 'Link già presente: data di aggiunta aggiornata.'
          : 'Link aggiunto al prossimo digest.';
        input.value = '';
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        const manualDetails = document.querySelector('[data-manual-details]');
        const manualUrl = document.querySelector('[data-manual-form] [name="url"]');
        if (manualUrl) manualUrl.value = input.value;
        if (manualDetails) manualDetails.open = true;
        status.dataset.error = 'true';
        const message = error instanceof Error ? error.message : 'Inserimento non riuscito';
        status.textContent = message + ' Puoi inserire i dettagli manualmente.';
      } finally {
        button.disabled = false;
      }
    });

    document.querySelector('[data-manual-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button');
      const status = form.querySelector('[data-manual-status]');
      if (!requireToken(status)) return;
      button.disabled = true;
      status.dataset.error = 'false';
      status.textContent = 'Salvataggio in corso…';

      try {
        const response = await fetch('/digest-items/manuale', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Digest-Token': digestToken
          },
          body: JSON.stringify({
            url: form.elements.url.value,
            titolo: form.elements.titolo.value,
            descrizione: form.elements.descrizione.value,
            thumbnail: form.elements.thumbnail.value
          })
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          forgetInvalidToken();
          throw new Error('Token non valido. Riprova e inserisci quello corretto.');
        }
        if (!response.ok) throw new Error(result.error || 'Salvataggio manuale non riuscito');
        status.textContent = result.duplicate
          ? 'Elemento aggiornato.'
          : 'Elemento aggiunto.';
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        status.dataset.error = 'true';
        status.textContent = error instanceof Error ? error.message : 'Salvataggio manuale non riuscito';
      } finally {
        button.disabled = false;
      }
    });
    ${editBehavior}
    ${deleteBehavior}
  </script>`;
}

export function renderDigestPage(
  settimana: string | null,
  items: DigestItem[],
  adminToken: string | null = null,
  pendingItems: DigestItem[] = [],
): string {
  const dateRange = settimana ? formatIsoWeekDateRange(settimana) : null;
  const content = settimana
    ? `<main class="shell">
        <p class="eyebrow">Digest settimanale</p>
        <h1>${escapeHtml(dateRange ?? '')}</h1>
        <p class="summary">${escapeHtml(formatDigestSummary(items))}</p>
        ${renderSearchForm('', adminToken)}
        ${renderAddForm()}
        ${renderPendingSection(pendingItems)}
        <section class="cards" aria-label="Salvataggi">${items.map((item) => renderCard(item)).join('')}</section>
        ${renderEditDialog()}
        <a class="footer-link" href="/categorie${escapeHtml(adminQuery(adminToken))}">Categorie →</a><br />
        <a class="footer-link" href="/archivio${escapeHtml(adminQuery(adminToken))}">Archivio →</a>
      </main>${pageScript()}`
    : `<main class="shell">
        <p class="eyebrow">Digest settimanale</p>
        <h1>Nessun digest</h1>
        ${renderSearchForm('', adminToken)}
        ${renderAddForm()}
        ${renderPendingSection(pendingItems)}
        ${renderEditDialog()}
        <a class="footer-link" href="/categorie${escapeHtml(adminQuery(adminToken))}">Categorie →</a><br />
        ${pendingItems.length === 0 ? '<div class="empty">Non ci sono ancora elementi archiviati.</div>' : ''}
        <a class="footer-link" href="/archivio${escapeHtml(adminQuery(adminToken))}">Archivio →</a>
      </main>${pageScript()}`;

  return pageShell(dateRange ? `Digest ${dateRange}` : 'Weekly Digest', content);
}

export function renderArchivePage(weeks: string[], adminToken: string | null = null): string {
  const suffix = adminQuery(adminToken);
  const list = weeks.length > 0
    ? `<nav class="weeks" aria-label="Settimane archiviate">${weeks.map((week) =>
      `<a class="week-link" href="/settimana/${encodeURIComponent(week)}${escapeHtml(suffix)}"><span>${escapeHtml(formatIsoWeekDateRange(week))}</span><span aria-hidden="true">→</span></a>`,
    ).join('')}</nav>`
    : '<div class="empty">Non ci sono ancora settimane archiviate.</div>';

  return pageShell('Archivio', `<main class="shell">
    <p class="eyebrow">Weekly Digest</p>
    <h1>Archivio</h1>
    ${renderSearchForm('', adminToken)}
    <a class="footer-link" href="/categorie${escapeHtml(suffix)}">Categorie →</a>
    ${list}
    <a class="footer-link" href="/${escapeHtml(suffix)}">← Ultimo digest</a>
  </main>`);
}

export function renderCategoriesPage(counts: Map<DigestTag, number>, adminToken: string | null = null): string {
  const list = DIGEST_TAGS.filter((tag) => (counts.get(tag) ?? 0) > 0)
    .map((tag) => `<a class="category-link" href="/categoria/${encodeURIComponent(tag)}${escapeHtml(adminQuery(adminToken))}"><span>${escapeHtml(tag)}</span><span>${counts.get(tag)}</span></a>`)
    .join('');
  return pageShell('Categorie', `<main class="shell">
    <p class="eyebrow">Weekly Digest</p>
    <h1>Categorie</h1>
    <p class="summary">Un link può comparire in più categorie.</p>
    <nav class="weeks" aria-label="Categorie">${list || '<div class="empty">Nessun link classificato.</div>'}</nav>
    <a class="footer-link" href="/archivio${escapeHtml(adminQuery(adminToken))}">← Archivio</a>
  </main>`);
}

export function renderCategoryPage(tag: DigestTag, items: DigestItem[], adminToken: string | null = null): string {
  return pageShell(tag, `<main class="shell">
    <p class="eyebrow">Categoria</p>
    <h1>${escapeHtml(tag)}</h1>
    <p class="summary">${items.length} link</p>
    <section class="cards" aria-label="Link della categoria">${items.map(renderCard).join('')}</section>
    ${renderEditDialog()}
    <a class="footer-link" href="/categorie${escapeHtml(adminQuery(adminToken))}">← Categorie</a>
  </main>${pageScript()}`);
}

export function renderSearchPage(
  query: string,
  result: SearchResult,
  adminToken: string | null = null,
): string {
  const count = result.items.length;
  const summary = !query
    ? 'Inserisci una o più parole per cercare nei titoli e nelle descrizioni.'
    : count === 0
      ? 'Nessun risultato trovato.'
      : `${count} ${count === 1 ? 'risultato' : 'risultati'} · ${result.matchedWords} ${result.matchedWords === 1 ? 'parola trovata' : 'parole trovate'} su ${result.totalWords}`;
  const translationNote = result.translationUnavailable
    ? '<p class="search-note">La traduzione non è disponibile ora: alcuni risultati in altre lingue potrebbero mancare.</p>'
    : '';
  return pageShell('Cerca nel digest', `<main class="shell">
    <p class="eyebrow">Weekly Digest</p>
    <h1>Cerca</h1>
    ${renderSearchForm(query, adminToken)}
    <p class="search-note">${escapeHtml(summary)}</p>
    ${translationNote}
    <section class="cards" aria-label="Risultati della ricerca">${result.items.map(renderCard).join('')}</section>
    ${renderEditDialog()}
    <a class="footer-link" href="/archivio${escapeHtml(adminQuery(adminToken))}">← Archivio</a>
  </main>${pageScript()}`);
}

export function renderArticlePage(item: DigestItem, useItalianTranslation = false): string {
  const truncationNote = item.troncato === true
    ? '<p class="truncated-note">Testo troncato — apri l’originale per il resto</p>'
    : '';
  const translated = useItalianTranslation && Boolean(item.testoTradotto);
  const articleTitle = translated && item.titoloTradotto ? item.titoloTradotto : item.titolo;
  const articleHtml = translated
    ? item.testoTradotto ?? ''
    : item.testoLeggibile ?? '<p>Testo non disponibile.</p>';
  const translationControls = item.testoLeggibile
    ? translated
      ? `<div class="translation-controls"><a href="/leggi/${encodeURIComponent(item.id)}">Mostra originale</a></div>`
      : `<div class="translation-controls">
          <button class="translate-button" type="button" data-translate-id="${escapeHtml(item.id)}">Traduci in italiano</button>
          <span class="translation-status" data-translation-status aria-live="polite"></span>
        </div>`
    : '';
  const translationScript = item.testoLeggibile && !translated
    ? `<script>
      document.querySelector('[data-translate-id]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const status = document.querySelector('[data-translation-status]');
        let token = '';
        try { token = window.localStorage.getItem('weekly-digest-token') || ''; } catch {}
        if (!token) {
          token = window.prompt('Inserisci il token del digest. Verrà ricordato solo su questo browser.')?.trim() || '';
          if (!token) return;
          try { window.localStorage.setItem('weekly-digest-token', token); } catch {}
        }
        button.disabled = true;
        status.textContent = 'Traduzione in corso…';
        try {
          const response = await fetch('/digest-items/' + encodeURIComponent(button.dataset.translateId) + '/traduci', {
            method: 'POST',
            headers: { 'X-Digest-Token': token }
          });
          const result = await response.json().catch(() => ({}));
          if (response.status === 401) {
            try { window.localStorage.removeItem('weekly-digest-token'); } catch {}
          }
          if (!response.ok) throw new Error(result.error || 'Traduzione non riuscita');
          window.location.href = '/leggi/' + encodeURIComponent(button.dataset.translateId) + '?lang=it';
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : 'Traduzione non riuscita';
          button.disabled = false;
        }
      });
    </script>`
    : '';

  return pageShell(articleTitle, `<main class="reader">
    <nav class="reader-nav"><a href="/">← torna al digest</a></nav>
    ${translationControls}
    <article>
      <h1>${escapeHtml(articleTitle)}</h1>
      <div class="article-body">${articleHtml}</div>
    </article>
    <footer class="reader-footer">
      ${truncationNote}
      <a href="${escapeHtml(item.url)}" rel="noopener noreferrer">apri l’originale</a>
    </footer>
  </main>${translationScript}`, 'reader');
}

export function renderNotFoundPage(): string {
  return pageShell('Non trovato', `<main class="shell">
    <p class="eyebrow">404</p>
    <h1>Pagina non trovata</h1>
    <a class="footer-link" href="/">← Torna al digest</a>
  </main>`);
}

export function renderErrorPage(status = 500): string {
  const isBadRequest = status === 400;
  return pageShell('Errore', `<main class="shell">
    <p class="eyebrow">Errore ${status}</p>
    <h1>${isBadRequest ? 'Richiesta non valida' : 'Qualcosa è andato storto'}</h1>
    <div class="empty">${isBadRequest
    ? 'Controlla i dati inviati e riprova.'
    : 'Non è stato possibile caricare questa pagina. Riprova tra poco.'}</div>
    <a class="footer-link" href="/">← Torna al digest</a>
  </main>`);
}
