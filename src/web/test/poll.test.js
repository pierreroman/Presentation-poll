import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.js';
import { LocalStore, AzureStore } from '../store.js';

const adminToken = 'test-only-presenter-key-not-a-real-secret';
const cookieSecret = 'test-only-cookie-key-not-a-real-secret-123456';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'poll-test-'));
  const file = join(directory, 'poll.json');
  const store = new LocalStore(file);
  const app = await createApp({ adminToken, cookieSecret, store });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const request = (path, body, cookie, token) => fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const visitor = async () => {
    const response = await request('/api/poll');
    return { cookie: response.headers.get('set-cookie').split(';')[0], poll: await response.json() };
  };
  return { store, file, request, visitor, origin };
}

test('all six exact myths and answer choices are served; all choices are accepted', async (t) => {
  const { visitor, request } = await setup(t);
  const { cookie, poll } = await visitor();
  assert.deepEqual(poll.questions.map((q) => q.text), [
    'Digital sovereignty requires a local cloud provider.',
    'Data residency alone addresses sovereignty.',
    'Disconnected is always more secure.',
    'Sovereign means giving up modern AI.',
    "The provider's engineers can access my data whenever they like.",
    'If my provider is headquartered abroad, its home government can get my data.',
  ]);
  assert.deepEqual(poll.answers, ['Busted', 'Plausible', 'Confirmed']);
  assert.deepEqual(poll.ballot, [null, null, null, null, null, null]);
  for (let question = 1; question <= 6; question++) {
    const response = await request('/api/votes', { question, answer: (question - 1) % 3, round: poll.round }, cookie);
    assert.equal(response.status, 201);
  }
  const state = await (await request('/api/poll', undefined, cookie)).json();
  assert.deepEqual(state.ballot, [0, 1, 2, 0, 1, 2]);
});

test('votes are shared, duplicate-safe under concurrency and durable across restart', async (t) => {
  const { visitor, request, file } = await setup(t);
  const first = await visitor();
  const payload = { question: 1, answer: 0, round: first.poll.round };
  const duplicates = await Promise.all(Array.from({ length: 10 }, () => request('/api/votes', payload, first.cookie)));
  assert.equal(duplicates.filter((r) => r.status === 201).length, 1);
  assert.equal(duplicates.filter((r) => r.status === 409).length, 9);
  const others = await Promise.all(Array.from({ length: 24 }, () => visitor()));
  const responses = await Promise.all(others.map(({ cookie }, i) => request('/api/votes', { ...payload, answer: i % 3 }, cookie)));
  assert.ok(responses.every((r) => r.status === 201));
  const result = await (await request('/api/results')).json();
  assert.deepEqual(result.results[0], { id: 1, counts: [9, 8, 8], total: 25 });
  const restored = new LocalStore(file);
  await restored.init();
  assert.deepEqual(await restored.counts(payload.round, 1), [9, 8, 8]);
});

test('presenter authorization, close/open, and reset isolate rounds', async (t) => {
  const { visitor, request } = await setup(t);
  const { cookie, poll } = await visitor();
  assert.equal((await request('/api/admin', { action: 'reset' })).status, 401);
  assert.equal((await request('/api/admin', { action: 'reset' }, undefined, 'wrong-key')).status, 401);
  assert.equal((await request('/api/admin', { action: 'close' }, undefined, adminToken)).status, 200);
  const payload = { question: 1, answer: 2, round: poll.round };
  assert.equal((await request('/api/votes', payload, cookie)).status, 403);
  await request('/api/admin', { action: 'open' }, undefined, adminToken);
  assert.equal((await request('/api/votes', payload, cookie)).status, 201);
  const reset = await (await request('/api/admin', { action: 'reset' }, undefined, adminToken)).json();
  assert.notEqual(reset.round, poll.round);
  assert.equal((await request('/api/votes', payload, cookie)).status, 409);
  const results = await (await request('/api/results')).json();
  assert.ok(results.results.every((r) => r.total === 0));
  const ballot = await (await request('/api/poll', undefined, cookie)).json();
  assert.deepEqual(ballot.ballot, [null, null, null, null, null, null]);
  assert.equal((await request('/api/votes', { ...payload, round: reset.round }, cookie)).status, 201);
});

test('invalid input, forged cookies, cross-origin posts and invalid routes are handled explicitly', async (t) => {
  const { request, visitor, origin } = await setup(t);
  const { poll, cookie } = await visitor();
  for (const payload of [
    {}, { question: 0, answer: 0, round: poll.round }, { question: 7, answer: 0, round: poll.round },
    { question: 1, answer: -1, round: poll.round }, { question: 1, answer: 3, round: poll.round },
    { question: '1', answer: 0, round: poll.round }, { question: 1, answer: 1.5, round: poll.round },
  ]) assert.equal((await request('/api/votes', payload, cookie)).status, 400);
  const forged = await request('/api/poll', undefined, 'voter=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bad');
  assert.match(forged.headers.get('set-cookie'), /HttpOnly/i);
  const crossOrigin = await fetch(`${origin}/api/votes`, {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 1, answer: 0, round: poll.round }),
  });
  assert.equal(crossOrigin.status, 403);
  const malformed = await fetch(`${origin}/api/votes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await request('/results/7')).status, 404);
  for (const path of ['/', '/presenter', ...Array.from({ length: 6 }, (_, i) => `/results/${i + 1}`)]) {
    const response = await request(path);
    assert.equal(response.status, 200, `${path} must serve the app`);
    assert.match(await response.text(), /<main id="app"/);
    assert.equal(response.headers.get('x-frame-options'), path.startsWith('/results/') ? null : 'DENY');
  }
  for (const path of ['/styles.css', '/theme.js', '/app.js', '/ignite-background.jpg']) {
    assert.equal((await request(path)).status, 200, `${path} must be served`);
  }
  assert.match((await request('/api/results')).headers.get('cache-control'), /no-store/);
  assert.equal((await request('/health')).status, 200);
  const qr = await request('/api/qr');
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
});

test('slide background is served as a JPEG and styling retains Ignite and neutral themes', async (t) => {
  const { request } = await setup(t);
  const background = await request('/ignite-background.jpg');
  assert.match(background.headers.get('content-type'), /image\/jpeg/);
  const bytes = Buffer.from(await background.arrayBuffer());
  assert.equal(bytes.length, 182784);
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  const css = await (await request('/styles.css')).text();
  assert.match(css, /html\[data-theme="ignite"\]/);
  assert.match(css, /--cp-accent: #8dc8e8/);
  assert.match(css, /html\[data-theme="dark"\]/);
});

test('storage corruption fails explicitly rather than discarding votes', async (t) => {
  const { file } = await setup(t);
  const original = await readFile(file, 'utf8');
  await writeFile(file, '{broken');
  await assert.rejects(new LocalStore(file).init(), SyntaxError);
  await writeFile(file, original);
});

test('configuration requires secrets and shared storage in production', async () => {
  await assert.rejects(createApp({ adminToken: 'short', cookieSecret }), /ADMIN_TOKEN/);
  await assert.rejects(createApp({ adminToken: '@Microsoft.KeyVault(SecretUri=https://example.invalid)', cookieSecret }), /unresolved/);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(createApp({ adminToken, cookieSecret }), /AZURE_TABLE_ENDPOINT/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('Azure aggregate reads have a deadline and surface query errors for retry', async () => {
  const store = Object.create(AzureStore.prototype);
  let options;
  store.table = {
    async *listEntities(value) {
      options = value;
      yield { answer: 0 };
      yield { answer: 2 };
    },
  };
  assert.deepEqual(await store.counts('test-round', 1), [1, 0, 1]);
  assert.ok(options.abortSignal instanceof AbortSignal);
  assert.equal(options.abortSignal.aborted, false);
  store.table.listEntities = async function* () { throw new Error('query interrupted'); };
  await assert.rejects(store.counts('test-round', 1), /query interrupted/);
});
