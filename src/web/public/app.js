const app = document.querySelector('#app');
const isPresenter = location.pathname === '/presenter';
const resultMatch = location.pathname.match(/^\/results\/([1-6])$/);
const labels = ['Busted', 'Plausible', 'Confirmed'];
let poll;
let adminToken = '';
let busy = false;
let lastResults;
let stopPolling;
let themeBackground;
const escape = (text) => String(text).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The request failed.');
  return data;
}

function notice(message, target = '#notice') {
  const element = document.querySelector(target);
  if (element) element.textContent = message;
}

function shell(content) {
  app.className = 'shell';
  app.innerHTML = `<header class="topbar">
    <span class="brand">Sovereign Cloud / Mythbusters</span>
    <span id="poll-status" class="badge"></span>
  </header>${content}`;
  app.setAttribute('aria-busy', 'false');
}

function setStatus(open) {
  const badge = document.querySelector('#poll-status');
  if (badge) {
    badge.textContent = open ? 'Voting open' : 'Voting closed';
    badge.classList.toggle('open', open);
  }
}

function renderAudience() {
  shell(`<section class="hero">
    <div class="eyebrow">You decide</div>
    <h1>Six myths.<br>What's your verdict?</h1>
    <p class="intro">Put digital sovereignty to the test. Choose <strong>Busted</strong>,
      <strong>Plausible</strong>, or <strong>Confirmed</strong> for each statement.</p>
  </section>
  <div class="row"><strong id="progress-text"></strong><span class="muted">One vote per myth</span></div>
  <div class="progress-track" role="progressbar" aria-label="Myths answered" aria-valuemin="0" aria-valuemax="6">
    <div class="progress-fill"></div>
  </div>
  <p id="notice" class="notice error" role="alert"></p>
  <section class="questions" aria-label="Poll questions">${poll.questions.map((q) => `
    <article class="card" data-question="${q.id}">
      <div class="myth-number">Myth ${q.id.toString().padStart(2, '0')}</div>
      <h2 id="question-${q.id}">"${escape(q.text)}"</h2>
      <div class="answer-options" role="group" aria-labelledby="question-${q.id}">
        ${labels.map((label, answer) => `<button class="answer" data-answer="${answer}" aria-pressed="false">
          <span class="answer-index">${answer + 1}</span>${label}</button>`).join('')}
      </div>
      <p class="vote-status" aria-live="polite"></p>
    </article>`).join('')}
  </section>
  <p id="complete" class="complete" aria-live="polite"></p>
  <footer class="footer">Anonymous voting. Your answer is final for this round.
    Cookies keep your votes on this browser; clearing them or switching devices allows another vote.</footer>`);
  updateAudience();
}

function updateAudience() {
  setStatus(poll.open);
  const done = poll.ballot.filter((answer) => answer !== null).length;
  document.querySelector('#progress-text').textContent = `${done} of 6 answered`;
  const progress = document.querySelector('[role="progressbar"]');
  progress.setAttribute('aria-valuenow', String(done));
  progress.firstElementChild.style.width = `${done / 6 * 100}%`;
  document.querySelector('#complete').textContent = done === 6 ? "You're all set. Thanks for joining the debate." : '';
  for (const card of document.querySelectorAll('[data-question]')) {
    const answer = poll.ballot[Number(card.dataset.question) - 1];
    for (const button of card.querySelectorAll('[data-answer]')) {
      button.disabled = busy || !poll.open || answer !== null;
      button.setAttribute('aria-pressed', String(answer === Number(button.dataset.answer)));
    }
    card.querySelector('.vote-status').textContent = answer !== null
      ? `Vote recorded: ${labels[answer]}` : poll.open ? 'Choose your verdict.' : 'The presenter has paused voting.';
  }
}

async function loadThemeBackground() {
  if (document.documentElement.dataset.theme !== 'ignite' || themeBackground) return;
  const response = await fetch('/ignite-background.jpg', { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Unable to load the Ignite slide background. Please reload.');
  const blob = await response.blob();
  themeBackground = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to prepare the Ignite background for export.'));
    reader.readAsDataURL(blob);
  });
}

function chart(result, background = '/ignite-background.jpg') {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(`--cp-${name}`).trim();
  const percentages = result.total ? result.counts.map((count) => count / result.total * 100) : [0, 0, 0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"
    role="img" aria-label="${labels.map((label, i) => `${label}: ${result.counts[i]} votes, ${Math.round(percentages[i])}%`).join('; ')}">
    <rect width="640" height="640" fill="${color('bg')}"/>
    ${document.documentElement.dataset.theme === 'ignite'
      ? `<image href="${background}" width="640" height="640" preserveAspectRatio="xMaxYMid slice"/>
        <rect width="640" height="640" fill="${color('overlay')}"/>` : ''}
    <g font-family="Segoe UI, Aptos, Calibri, sans-serif" fill="${color('text')}">
    ${labels.map((label, index) => {
      const y = 130 + index * 170;
      return `<text x="48" y="${y}" font-size="32" font-weight="600">${label}</text>
        <text x="592" y="${y}" text-anchor="end" font-size="34" font-weight="650">${Math.round(percentages[index])}%</text>
        <rect x="48" y="${y + 24}" width="544" height="24" rx="6" fill="${color('border')}"/>
        <rect x="48" y="${y + 24}" width="${544 * percentages[index] / 100}" height="24" rx="6" fill="${color('accent')}"/>
        <text x="48" y="${y + 80}" font-size="22" fill="${color('text-muted')}">${result.counts[index]} ${result.counts[index] === 1 ? 'vote' : 'votes'}</text>`;
    }).join('')}</g></svg>`;
}

function drawResults(data) {
  lastResults = data;
  setStatus(data.open);
  for (const element of document.querySelectorAll('[data-chart]')) {
    const result = data.results.find((r) => r.id === Number(element.dataset.chart));
    element.innerHTML = chart(result);
  }
}

function presenterLogin() {
  shell(`<section class="card login">
    <div class="eyebrow">Presenter access</div>
    <h1>Run the room.</h1>
    <p class="muted">Enter your presenter key to manage voting and get your slide-ready results.</p>
    <form id="login-form">
      <label for="key">Presenter key</label>
      <input type="password" id="key" autocomplete="current-password" required>
      <button class="primary" type="submit">Open presenter dashboard</button>
    </form><p id="notice" class="notice error" role="alert"></p>
  </section>`);
}

async function presenterDashboard() {
  poll = await api('/api/poll');
  const theme = document.documentElement.dataset.theme;
  const resultsUrl = (id) => `${location.origin}/results/${id}?scoutTheme=${theme}`;
  shell(`<section class="hero"><div class="eyebrow">Presenter dashboard</div>
    <h1>Let the audience<br>have their say.</h1>
    <p class="intro">Share the poll. Watch the verdicts arrive. Drop a live results view into each slide.</p></section>
    <section class="card join"><img src="/api/qr" alt="QR code linking to the audience voting page">
      <div><div class="eyebrow">Scan to vote</div><p class="join-url"><a href="/">${escape(location.origin)}</a></p>
      <button data-copy="${escape(location.origin)}">Copy audience link</button></div></section>
    <div class="toolbar">
      <div class="row"><button class="primary" data-action="open">Open voting</button>
      <button data-action="close">Close voting</button><button data-action="reset">Start new round</button></div>
      <div class="row"><label for="theme">Chart theme</label><select id="theme">
        <option value="ignite" ${theme === 'ignite' ? 'selected' : ''}>Ignite (slide 1)</option>
        <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
        <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option></select>
        <button id="logout">Lock dashboard</button></div>
    </div>
    <p id="notice" class="notice" role="status" aria-live="polite"></p>
    <p class="muted">Live views refresh every 2 seconds. The square contains only answer labels, percentages and vote counts.
      Embed via an approved PowerPoint web-viewer add-in, or insert a PNG/SVG snapshot as a picture.</p>
    <section class="results-grid">${poll.questions.map((q) => `<article class="card">
      <div class="myth-number">Myth ${q.id.toString().padStart(2, '0')}</div><h2>${escape(q.text)}</h2>
      <div class="chart" data-chart="${q.id}"></div>
      <div class="chart-actions">
        <a class="button live-link" href="${resultsUrl(q.id)}" target="_blank" rel="noopener" data-id="${q.id}">Live square</a>
        <button class="copy-result" data-copy="${resultsUrl(q.id)}" data-id="${q.id}">Copy URL</button>
        <button data-export="png" data-id="${q.id}">PNG</button>
        <button data-export="svg" data-id="${q.id}">SVG</button>
      </div></article>`).join('')}</section>
    <footer class="footer">Presenter keys stay in memory only. New rounds hide previous results; old Azure vote rows remain stored
    until removed through your storage retention process. No voter identities are shown.</footer>`);
  drawResults(await api('/api/results'));
}

function startPolling(tick, onError) {
  let stopped = false;
  let timer;
  async function run() {
    try { await tick(); } catch (error) { onError(error); }
    if (!stopped) timer = setTimeout(run, 2000);
  }
  timer = setTimeout(run, 2000);
  return () => { stopped = true; clearTimeout(timer); };
}

async function exportChart(id, format) {
  if (!lastResults) throw new Error('Results are not loaded yet.');
  await loadThemeBackground();
  const svg = chart(lastResults.results.find((r) => r.id === id), themeBackground);
  let blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'png') {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1200;
      canvas.getContext('2d').drawImage(image, 0, 0, 1200, 1200);
      blob = await new Promise((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `myth-${id}-results.${format}` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

app.addEventListener('submit', async (event) => {
  if (event.target.id !== 'login-form') return;
  event.preventDefault();
  const button = event.target.querySelector('button');
  button.disabled = true;
  adminToken = document.querySelector('#key').value.trim();
  try {
    await api('/api/admin', { headers: { Authorization: `Bearer ${adminToken}` } });
    await presenterDashboard();
    stopPolling = startPolling(async () => {
      drawResults(await api('/api/results'));
      notice('');
    }, (error) => notice(`Live update failed: ${error.message}`));
  } catch (error) {
    adminToken = '';
    notice(error.message);
    button.disabled = false;
  }
});

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-answer')) {
    if (busy) return;
    busy = true;
    updateAudience();
    notice('');
    try {
      const question = Number(button.closest('[data-question]').dataset.question);
      await api('/api/votes', {
        method: 'POST', body: JSON.stringify({ question, answer: Number(button.dataset.answer), round: poll.round }),
      });
      poll = await api('/api/poll');
    } catch (error) {
      notice(error.message);
      try { poll = await api('/api/poll'); } catch (refreshError) { notice(`${error.message} ${refreshError.message}`); }
    } finally { busy = false; updateAudience(); }
  } else if (button.dataset.copy) {
    try { await navigator.clipboard.writeText(button.dataset.copy); notice('Link copied.'); }
    catch { notice(`Copy this link manually: ${button.dataset.copy}`); }
  } else if (button.dataset.export) {
    try { await exportChart(Number(button.dataset.id), button.dataset.export); }
    catch (error) { notice(error.message); }
  } else if (button.dataset.action) {
    if (button.dataset.action === 'reset' && !confirm('Start a new round? Current results will clear and everyone can vote again.')) return;
    button.disabled = true;
    try {
      await api('/api/admin', {
        method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action: button.dataset.action }),
      });
      drawResults(await api('/api/results'));
      notice(button.dataset.action === 'reset' ? 'New round started.' : `Voting ${button.dataset.action === 'open' ? 'opened' : 'closed'}.`);
    } catch (error) { notice(error.message); }
    finally { button.disabled = false; }
  } else if (button.id === 'logout') {
    stopPolling?.();
    adminToken = '';
    presenterLogin();
  }
});

app.addEventListener('change', (event) => {
  if (event.target.id !== 'theme') return;
  const theme = event.target.value;
  document.documentElement.dataset.theme = theme;
  const url = new URL(location.href);
  url.searchParams.set('scoutTheme', theme);
  history.replaceState(null, '', url);
  for (const link of document.querySelectorAll('.live-link, .copy-result')) {
    const resultUrl = `${location.origin}/results/${link.dataset.id}?scoutTheme=${theme}`;
    if (link.matches('a')) link.href = resultUrl;
    else link.dataset.copy = resultUrl;
  }
  if (lastResults) drawResults(lastResults);
});

async function main() {
  if (resultMatch) {
    document.body.classList.add('embed-mode');
    app.innerHTML = `<div class="chart" data-chart="${resultMatch[1]}"></div><p class="embed-error" role="alert"></p>`;
    app.setAttribute('aria-busy', 'false');
    const refresh = async () => {
      drawResults(await api('/api/results'));
      notice('', '.embed-error');
    };
    // Start retries even when the first request fails.
    stopPolling = startPolling(refresh, (error) => notice(`Live results unavailable: ${error.message}`, '.embed-error'));
    try { await refresh(); } catch (error) { notice(error.message, '.embed-error'); }
  } else if (isPresenter) {
    presenterLogin();
  } else {
    poll = await api('/api/poll');
    renderAudience();
    stopPolling = startPolling(async () => {
      if (busy) return;
      const state = await api('/api/results');
      if (state.round !== poll.round) {
        poll = await api('/api/poll');
        renderAudience();
        notice('A new round has started. You can vote again.');
      } else if (state.open !== poll.open) {
        poll.open = state.open;
        updateAudience();
      }
      notice('', '#connection-error');
    }, (error) => {
      let element = document.querySelector('#connection-error');
      if (!element) {
        element = Object.assign(document.createElement('p'), { id: 'connection-error', className: 'notice error' });
        element.setAttribute('role', 'alert');
        document.querySelector('.hero').append(element);
      }
      element.textContent = `Connection lost: ${error.message}`;
    });
  }
}

main().catch((error) => {
  shell(`<section class="card login"><h1>Unable to connect.</h1><p class="error" role="alert">${escape(error.message)}</p>
    <a class="button" href="${escape(location.pathname)}">Try again</a></section>`);
});
