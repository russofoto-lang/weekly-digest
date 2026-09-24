# Weekly Digest

Backend Express/TypeScript per raccogliere articoli e video YouTube in un digest settimanale salvato su Firestore.

## Sviluppo locale

Richiede Node.js 20 e Application Default Credentials per accedere a Firestore.

```bash
cp .env.example .env
npm install
npm run dev
```

Endpoint disponibili:

- `GET /health`
- `GET /digest-items?settimana=2026-W35`
- `POST /digest-items`
- `DELETE /digest-items/:id`
- `POST /genera-digest`
- `GET /`
- `GET /leggi/:id`
- `GET /archivio`
- `GET /categorie`
- `GET /categoria/:tag`
- `GET /cerca?q=ai+aziende+piccole`
- `GET /settimana/:iso`

Le route POST protette richiedono l'header `X-Digest-Token` uguale a `DIGEST_TOKEN`.

Per mostrare i controlli di eliminazione nelle card, apri la homepage con `?admin=DIGEST_TOKEN`. Il link pubblico senza parametro non mostra alcun controllo amministrativo.

Esempio body per la creazione:

```json
{
  "url": "https://example.com/articolo"
}
```

Il server riconosce i link YouTube e usa l'API pubblica oEmbed; per gli articoli estrae Open Graph e il contenuto Readability sanificato. Gli URL `pending` già presenti aggiornano soltanto `dataAggiunta`. `id`, metadati, `dataAggiunta`, `stato` e `settimana` vengono valorizzati automaticamente. La settimana segue ISO 8601 (`YYYY-Www`).

## Cloud Run

La ricerca confronta le parole con titolo e descrizione, anche tramite traduzione inglese dei metadati e della query. Mostra prima i risultati con tutte le parole; se non ce ne sono, passa alle combinazioni con meno parole. Il service account di Cloud Run deve poter usare Cloud Translation API.

I link nuovi ricevono fino a tre categorie automatiche basate su titolo e descrizione. La pagina `/categorie` le raccoglie e il modulo **Modifica** permette di correggerle. Il comando protetto `POST /digest-items/classifica-esistenti` assegna categorie soltanto ai link privi di categorie; con body `{ "dryRun": true }` mostra un'anteprima senza scrivere nulla.

Il servizio usa le Application Default Credentials del service account associato a Cloud Run. Quel service account deve avere almeno il ruolo `roles/datastore.user` sul progetto Firestore.

Il file `firestore.indexes.json` contiene gli indici compositi richiesti dalle query ordinate su `digest_items` e va applicato al progetto Firebase.

```bash
gcloud run deploy weekly-digest \
  --source . \
  --region europe-west8 \
  --allow-unauthenticated \
  --set-env-vars FIREBASE_PROJECT_ID=YOUR_PROJECT_ID \
  --set-secrets DIGEST_TOKEN=DIGEST_TOKEN:latest,RESEND_API_KEY=RESEND_API_KEY:latest
```

Cloud Run fornisce automaticamente la variabile `PORT`; l'app ascolta su `0.0.0.0`.

`POST /genera-digest` invia tramite Resend tutti gli elementi `pending` e li archivia soltanto dopo una risposta positiva del provider. È pensato per essere richiamato da Cloud Scheduler ogni venerdì alle 18:00.

Ogni esecuzione viene registrata in `digest_runs/{settimana}`. Il run conserva l'elenco degli item, impedisce esecuzioni concorrenti e usa una chiave di idempotenza Resend stabile. Se l'invio riesce ma l'archiviazione Firestore fallisce, il tentativo successivo completa soltanto l'archiviazione senza spedire una seconda email. Il limite è 499 item per digest, così item e stato del run possono essere aggiornati atomicamente.
