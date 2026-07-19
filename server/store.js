// In-memory session store. Single Cloud Run instance (max-instances=1) keeps this honest
// for a hackathon demo; the replay session is seeded from disk so restarts cost nothing.
const crypto = require('crypto');

const DEFAULT_PROFILE = {
  // 6-8 domains, level 1-3. Seeded at onboarding, updated as cards are answered.
  'async-and-queues': 1,
  'databases': 2,
  'security': 1,
  'systems-design': 1,
  'testing': 2,
  'devops-and-deploy': 1,
  'frontend': 2,
  'algorithms': 2,
};

const sessions = new Map();
const users = new Map();

function newId() {
  return crypto.randomBytes(4).toString('hex');
}

function createUser({ email, name }) {
  const id = newId();
  const user = { id, email, name, createdAt: Date.now(), role: null, summary: null, domains: null };
  users.set(id, user);
  return user;
}

function getUser(id) {
  return users.get(id);
}

// Flatten the rich domain list into the {key: level} map the filter consumes.
function profileMap(user) {
  if (!user?.domains?.length) return null;
  return Object.fromEntries(user.domains.map(d => [d.key, d.level]));
}

function createSession(opts = {}) {
  const id = opts.id || newId();
  const session = {
    id,
    createdAt: Date.now(),
    eventsSeen: 0,        // everything the hook sent us
    eventsKept: 0,        // survived the pre-filter
    keptEvents: [],       // ring buffer of recent kept events (context for the filter)
    cards: [],            // surfaced cards, seq-numbered
    // A user's own profile replaces the default wholesale - their domains, not ours.
    profile: opts.profile ? { ...opts.profile } : { ...DEFAULT_PROFILE },
    lastCardAt: 0,        // budget: max ~1 card / 90s
    listeners: new Set(), // SSE responses
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function recordEvent(session, event) {
  session.eventsSeen += 1;
}

function keepEvent(session, event) {
  session.eventsKept += 1;
  session.keptEvents.push(event);
  if (session.keptEvents.length > 20) session.keptEvents.shift();
}

function addCard(session, card) {
  card.seq = session.cards.length + 1;
  card.at = Date.now();
  session.cards.push(card);
  session.lastCardAt = card.at;
  broadcast(session, { type: 'card', card, state: publicState(session) });
  return card;
}

function publicState(session) {
  return {
    id: session.id,
    eventsSeen: session.eventsSeen,
    eventsKept: session.eventsKept,
    cardsSurfaced: session.cards.length,
    profile: session.profile,
  };
}

function broadcast(session, payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of session.listeners) {
    try { res.write(data); } catch { session.listeners.delete(res); }
  }
}

module.exports = {
  createSession, getSession, recordEvent, keepEvent, addCard,
  publicState, broadcast, DEFAULT_PROFILE,
  createUser, getUser, profileMap,
};
