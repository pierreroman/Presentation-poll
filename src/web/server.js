import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { LocalStore, AzureStore } from './store.js';
import { questions, answers } from './questions.js';

const publicPath = fileURLToPath(new URL('./public/', import.meta.url));
const uuidPattern = /^[a-f0-9]{32}$/;
const equal = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function createApp(options = {}) {
  const production = process.env.NODE_ENV === 'production';
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN;
  const cookieSecret = options.cookieSecret ?? process.env.COOKIE_SECRET;
  if (!adminToken || adminToken.length < 24 || !cookieSecret || cookieSecret.length < 32) {
    throw new Error('Set ADMIN_TOKEN (24+ characters) and COOKIE_SECRET (32+ characters).');
  }
  if ([adminToken, cookieSecret].some((value) => value.startsWith('@Microsoft.KeyVault('))) {
    throw new Error('Key Vault references are unresolved. Check managed identity access and refresh references.');
  }
  if (production && !process.env.AZURE_TABLE_ENDPOINT && !options.store) {
    throw new Error('Production requires AZURE_TABLE_ENDPOINT; local files are development-only.');
  }
  const store = options.store ?? (process.env.AZURE_TABLE_ENDPOINT
    ? new AzureStore(process.env.AZURE_TABLE_ENDPOINT)
    : new LocalStore(resolve(process.env.DATA_FILE ?? 'data/poll.json')));
  await store.init();

  const app = express();
  app.disable('x-powered-by');
  if (production) app.set('trust proxy', 1);
  app.use(helmet({
    // Results are intentionally frameable by PowerPoint web-viewer add-ins.
    frameguard: false,
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'frame-ancestors': null,
        'upgrade-insecure-requests': production ? [] : null,
      },
    },
    strictTransportSecurity: production ? undefined : false,
  }));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/results/')) {
      res.set('X-Frame-Options', 'DENY');
      res.set('Content-Security-Policy', `${res.get('Content-Security-Policy')};frame-ancestors 'none'`);
    }
    next();
  });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '2kb' }));
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        return res.status(403).json({ error: 'Requests must come from this poll site.' });
      }
      if (!req.is('application/json')) {
        return res.status(415).json({ error: 'Send application/json.' });
      }
    }
    next();
  });
  const mutationLimit = rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' },
  });
  const voteLimit = rateLimit({
    windowMs: 60_000, limit: 30, keyGenerator: (req) => req.voterId,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many voting attempts. Please wait a minute.' },
  });
  const authLimit = rateLimit({
    windowMs: 60_000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many presenter sign-in attempts. Please wait a minute.' },
  });
  const sign = (value) => createHmac('sha256', cookieSecret).update(value).digest('hex');
  const voter = (req, res) => {
    const cookieName = production ? '__Host-voter' : 'voter';
    const raw = req.get('cookie')?.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const [id, signature] = (raw ?? '').split('.');
    if (uuidPattern.test(id ?? '') && signature && equal(signature, sign(id))) return id;
    const nextId = randomBytes(16).toString('hex');
    res.cookie(cookieName, `${nextId}.${sign(nextId)}`, {
      httpOnly: true, secure: production, sameSite: 'lax',
      maxAge: 86_400_000 * 30, path: '/',
    });
    return nextId;
  };
  const admin = (req, res, next) => {
    if (!equal(req.get('authorization') ?? '', `Bearer ${adminToken}`)) {
      return res.status(401).json({ error: 'Presenter key is incorrect.' });
    }
    next();
  };

  let cachedResults;
  let pendingResults;
  let revision = 0;
  const invalidate = () => { cachedResults = undefined; revision++; };
  async function results() {
    if (cachedResults && Date.now() - cachedResults.at < 2000) return cachedResults.value;
    if (pendingResults) return pendingResults;
    const version = revision;
    pendingResults = (async () => {
      const state = await store.state();
      const counts = await Promise.all(questions.map((q) => store.counts(state.round, q.id)));
      const value = { ...state, results: counts.map((votes, i) => ({
        id: i + 1, counts: votes, total: votes.reduce((sum, count) => sum + count, 0),
      })) };
      if (version === revision) cachedResults = { at: Date.now(), value };
      return value;
    })();
    try { return await pendingResults; } finally { pendingResults = undefined; }
  }

  app.get('/health', async (_req, res) => {
    await store.state();
    res.json({ status: 'ok' });
  });
  app.get('/api/poll', async (req, res) => {
    const id = voter(req, res);
    const state = await store.state();
    res.json({ ...state, questions, answers, ballot: await store.ballot(state.round, id) });
  });
  app.get('/api/results', async (_req, res) => res.json(await results()));
  app.post('/api/votes', (req, res, next) => {
    req.voterId = voter(req, res);
    next();
  }, voteLimit, async (req, res) => {
    const { question, answer, round } = req.body ?? {};
    if (!Number.isInteger(question) || question < 1 || question > 6
      || !Number.isInteger(answer) || answer < 0 || answer > 2 || typeof round !== 'string') {
      return res.status(400).json({ error: 'Choose a valid question and answer.' });
    }
    const state = await store.state();
    if (round !== state.round) return res.status(409).json({ error: 'A new round has started. Refresh to vote.' });
    if (!state.open) return res.status(403).json({ error: 'Voting is currently closed.' });
    const accepted = await store.vote(round, question, req.voterId, answer);
    if (!accepted) return res.status(409).json({ error: 'You have already voted on this myth.' });
    invalidate();
    res.status(201).json({ accepted: true });
  });
  app.get('/api/admin', authLimit, admin, async (_req, res) => res.json(await store.state()));
  app.post('/api/admin', authLimit, admin, mutationLimit, async (req, res) => {
    const action = req.body?.action;
    if (!['open', 'close', 'reset'].includes(action)) {
      return res.status(400).json({ error: 'Unknown presenter action.' });
    }
    const state = await store.configure(action);
    invalidate();
    console.info(`Presenter action: ${action}`);
    res.json(state);
  });
  app.get('/api/qr', async (req, res) => {
    const url = process.env.PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`;
    res.type('svg').send(await QRCode.toString(url, { type: 'svg', margin: 2, width: 320 }));
  });
  app.use(express.static(publicPath, { index: false }));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());
  app.get(['/', '/presenter', '/results/:id'], (req, res) => {
    if (req.path.startsWith('/results/') && !/^[1-6]$/.test(req.params.id ?? '')) {
      return res.status(404).type('text').send('Question not found.');
    }
    // The app may be checked out under .copilot; only this fixed file is allowed.
    res.sendFile(resolve(publicPath, 'index.html'), { dotfiles: 'allow' });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (error.statusCode === 412) {
      return res.status(409).json({ error: 'Another presenter changed the poll. Refresh and try again.' });
    }
    console.error('Poll request failed:', error);
    res.status(503).json({ error: 'The poll service is unavailable. Please try again.' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.info(`Poll ready at http://localhost:${port}`));
}
