import { formatDigestSummary } from './digest-summary.js';
import { formatIsoWeekDateRange, getIsoWeek } from './iso-week.js';
import type { DigestItem } from '../types/digest-item.js';

interface DigestEmailOptions {
  items: DigestItem[];
  baseUrl: string;
  date?: Date;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderThumbnail(item: DigestItem): string {
  if (!item.thumbnail) {
    return '<div style="width:72px;height:72px;border-radius:8px;background:#eeeae3;"></div>';
  }
  return `<img src="${escapeHtml(item.thumbnail)}" alt="" width="72" height="72" `
    + 'style="display:block;width:72px;height:72px;object-fit:cover;border-radius:8px;border:0;" />';
}

function renderCard(item: DigestItem, baseUrl: string): string {
  const href = item.tipo === 'articolo' && item.testoLeggibile
    ? `${baseUrl}/leggi/${encodeURIComponent(item.id)}`
    : item.url;
  const badge = item.tipo === 'youtube' ? 'video' : 'articolo';

  return `
    <a href="${escapeHtml(href)}" style="display:block;color:#292621;text-decoration:none;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="width:100%;border:1px solid #ded8cf;border-radius:10px;background:#ffffff;">
        <tr>
          <td width="72" valign="top" style="width:72px;padding:14px 0 14px 14px;">
            ${renderThumbnail(item)}
          </td>
          <td valign="top" style="padding:14px;">
            <span style="display:inline-block;margin:0 0 6px;padding:2px 7px;border-radius:999px;background:#eeeae3;color:#675f54;font-family:Arial,sans-serif;font-size:10px;line-height:15px;text-transform:uppercase;letter-spacing:.5px;">${badge}</span>
            <h2 style="margin:0 0 5px;color:#292621;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:22px;font-weight:700;">${escapeHtml(item.titolo)}</h2>
            <p style="margin:0;color:#6e675e;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:20px;">${escapeHtml(item.descrizione)}</p>
          </td>
        </tr>
      </table>
    </a>`;
}

export function buildDigestEmailHtml({ items, baseUrl, date = new Date() }: DigestEmailOptions): string {
  const summary = formatDigestSummary(items);
  const dateRange = formatIsoWeekDateRange(getIsoWeek(date));
  const cards = items.map((item) => renderCard(item, baseUrl)).join(
    '<div style="height:12px;line-height:12px;">&nbsp;</div>',
  );

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Digest settimanale</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f2ed;color:#292621;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f2ed;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:0 2px 20px;">
                <p style="margin:0 0 7px;color:#756d62;font-family:Arial,sans-serif;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px;">${escapeHtml(dateRange)}</p>
                <h1 style="margin:0 0 8px;color:#292621;font-size:30px;line-height:36px;">Il tuo digest settimanale</h1>
                <p style="margin:0;color:#6e675e;font-size:15px;line-height:22px;">${escapeHtml(summary)}</p>
              </td>
            </tr>
            <tr><td>${cards}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
