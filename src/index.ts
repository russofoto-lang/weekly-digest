import express from 'express';
import { env } from './lib/env.js';
import { digestItemsRouter } from './routes/digest-items.js';
import { generaDigestRouter } from './routes/genera-digest.js';
import { healthRouter } from './routes/health.js';
import { publicPagesRouter } from './routes/public-pages.js';
import { renderErrorPage } from './lib/web-pages.js';
import { prefersHtmlResponse } from './lib/response-format.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/health', healthRouter);
app.use('/digest-items', digestItemsRouter);
app.use('/genera-digest', generaDigestRouter);
app.use('/', publicPagesRouter);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  console.error('[unhandled error]', normalizedError.stack ?? normalizedError.message);

  if (res.headersSent) {
    next(error);
    return;
  }

  const reportedStatus = Number((error as { status?: unknown })?.status);
  const status = Number.isInteger(reportedStatus) && reportedStatus >= 400 && reportedStatus < 500
    ? reportedStatus
    : 500;
  const acceptsHtml = prefersHtmlResponse(
    req.get('accept'),
    req.accepts(['html', 'json']),
  );

  if (acceptsHtml) {
    res.status(status).type('html').send(renderErrorPage(status));
    return;
  }

  res.status(status).json({
    error: status === 400 ? 'Richiesta JSON non valida' : 'Errore interno del server',
  });
});

app.listen(env.port, '0.0.0.0', () => {
  console.log(`weekly-digest in ascolto sulla porta ${env.port}`);
});
