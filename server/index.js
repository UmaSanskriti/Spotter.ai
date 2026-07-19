const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const store = require('./store');
const { preFilter } = require('./prefilter');
const { runFilter } = require('./filter');
const { runAgent } = require('./agent');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-session.json'), 'utf8'));

// ---------- sessions ----------

app.post('/session', (req, res) => {
  const session = store.createSession({ profile: req.body?.profile });
  res.json({ id: session.id, joinUrl: joinUrl(req, session.id) });
});

app.get('/session/:id/state', (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'no such session' });
  res.json(store.publicState(s));
});

app.get('/session/:id/qr', async (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).end();
  const png = await QRCode.toBuffer(joinUrl(req, s.id), { width: 320, margin: 1 });
  res.type('png').send(png);
});

function joinUrl(req, id) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}/session.html?id=${id}`;
}

// ---------- ingest (Claude Code hooks / MCP shim POST here) ----------

app.post('/event', async (req, res) => {
  const id = req.query.session;
  const s = store.getSession(id);
  if (!s) return res.status(404).json({ error: 'no such session' });

  const raw = req.body || {};
  const event = {
    hook: req.query.type || raw.hook_event_name || 'PostToolUse',
    tool: raw.tool_name || raw.tool,
    input: raw.tool_input || raw.input || {},
    summary: raw.summary || raw.last_assistant_message,
    at: Date.now(),
  };

  store.recordEvent(s, event);
  store.broadcast(s, { type: 'tick', tool: event.tool || event.hook, state: store.publicState(s) });
  res.json({ ok: true, seen: s.eventsSeen }); // ack fast — never block the agent's hook

  if (!preFilter(event)) return;
  store.keepEvent(s, event);

  try {
    const card = await runFilter(s, event);
    if (card) store.addCard(s, card);
  } catch (err) {
    console.error('filter error', err.message);
  }
});

// ---------- built-in agent (side-by-side demo): chat left, cards right ----------

app.post('/agent/chat', async (req, res) => {
  const id = req.query.session;
  const s = store.getSession(id);
  if (!s) return res.status(404).json({ error: 'no such session' });

  const message = String(req.body?.message || '').slice(0, 4000);
  if (!message) return res.status(400).json({ error: 'empty message' });

  // Count the developer's request + the agent's turn as "actions the agent took", so the
  // silence counter on the right moves even on turns Spotter stays quiet.
  store.recordEvent(s, {});
  store.recordEvent(s, {});
  store.broadcast(s, { type: 'tick', tool: 'agent', state: store.publicState(s) });

  try {
    const { reply, cards, live } = await runAgent(s, message, req.body?.history || []);
    // Surfaced cards flow through the same store as the hook pipeline -> SSE -> right panel.
    for (const card of cards) store.addCard(s, card);
    res.json({ reply, cards, live });
  } catch (err) {
    console.error('agent error', err.message);
    res.status(502).json({ error: 'agent_failed', detail: err.message });
  }
});

// ---------- consumption: SSE for web, polling for Android ----------

app.get('/session/:id/stream', (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).end();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'hello', state: store.publicState(s), cards: s.cards })}\n\n`);
  s.listeners.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); s.listeners.delete(res); });
});

app.get('/session/:id/events', (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'no such session' });
  const since = Number(req.query.since || 0);
  res.json({
    state: store.publicState(s),
    cards: s.cards.filter(c => c.seq > since),
  });
});

// ---------- profile ----------

app.post('/session/:id/answer', (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'no such session' });
  const { domain, gotIt } = req.body || {};
  if (domain && s.profile[domain] != null && gotIt) {
    // Three understood cards in a domain = level up. Honest and simple; the graph comes later.
    s.answered = s.answered || {};
    s.answered[domain] = (s.answered[domain] || 0) + 1;
    if (s.answered[domain] >= 3 && s.profile[domain] < 3) {
      s.profile[domain] += 1;
      s.answered[domain] = 0;
      store.broadcast(s, { type: 'levelup', domain, level: s.profile[domain], state: store.publicState(s) });
    }
  }
  res.json({ ok: true, profile: s.profile });
});

// ---------- replay ----------

app.get('/demo', (_req, res) => res.json(DEMO));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`spotter listening on :${port}`));
