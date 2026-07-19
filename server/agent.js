// The built-in coding agent for the side-by-side demo.
//
// In the real product the agent is Claude Code / Gemini CLI / any MCP client, and Spotter
// observes it through hooks. For a self-contained demo (and for judges who open the app cold),
// we ship an agent *inside* Spotter: you chat with it on the left, it writes code AND self-reports
// the material decisions behind that code. Those decisions run through the exact same surfacing
// rule the hook pipeline uses, so cards land on the right in real time.
//
// Works two ways:
//   • GEMINI_API_KEY set  -> a real Gemini coding agent, live.
//   • no key              -> a scripted offline agent, so the demo never depends on the network.

const MODEL = process.env.SPOTTER_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// Same broad key detection as server/gemini.js - AI Studio injects API_KEY, the SDK uses
// GOOGLE_API_KEY, our docs say GEMINI_API_KEY. First one wins so a fresh deploy just works.
const API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.GENAI_API_KEY ||
  '';

// Same card shape the filter produces, so store.addCard / the client renderer are unchanged.
const AGENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: {
      type: 'STRING',
      description:
        'Your answer to the developer as their AI coding agent: one or two sentences of ' +
        'explanation followed by the actual code in a markdown ``` block. Ship real, working code.',
    },
    cards: {
      type: 'ARRAY',
      description:
        'The material decisions inside the code you just wrote that a senior would explain to a ' +
        'junior watching. 0 to 2 items. Empty for routine/boilerplate work. Never invent a lesson.',
      items: {
        type: 'OBJECT',
        properties: {
          domain: { type: 'STRING', description: 'One of the user profile domain keys.' },
          importance: { type: 'INTEGER', description: '1-5. 5 = an architectural fork in the road.' },
          above_user_level: { type: 'BOOLEAN', description: "Above this user's current level in that domain?" },
          headline: { type: 'STRING', description: 'Max 10 words. The decision, not the activity.' },
          what_happened: { type: 'STRING', description: 'One plain sentence about what you did.' },
          why_it_matters: { type: 'STRING', description: 'The underlying principle. Two sentences max.' },
          question: { type: 'STRING', description: 'One retrieval question answerable from the card.' },
          answer: { type: 'STRING', description: 'Reference answer, two sentences max.' },
        },
        required: ['domain', 'importance', 'above_user_level', 'headline',
                   'what_happened', 'why_it_matters', 'question', 'answer'],
      },
    },
  },
  required: ['reply', 'cards'],
};

function systemPrompt(session) {
  const profileLines = Object.entries(session.profile)
    .map(([d, l]) => `  ${d}: level ${l}/3`).join('\n');
  return `You are a senior AI coding agent pair-programming with a developer who is delegating the work to you.
Do the task well: write real, idiomatic, working code with a short explanation. This is the LEFT half of the screen.

You are also wired into Spotter, which teaches the developer while you work - the RIGHT half of the screen.
So alongside your code, surface the DECISIONS worth understanding: architecture choices, tradeoffs,
error-recovery strategy, security-relevant moves, concurrency/async subtleties. NOT routine edits or boilerplate.
Silence is a feature - most turns should surface 0 or 1 card, never more than 2. Only surface a decision that
is genuinely ABOVE this developer's current level in that domain; set above_user_level honestly.

USER PROFILE (domain: level, 1=beginner 3=strong - only teach ABOVE their level):
${profileLines}

For each surfaced card: headline names the decision, why_it_matters gives the underlying principle,
and question is answerable from the card alone after a beat of thought. Write for a smart person who
delegated the work and did not watch it happen.
Style: short plain sentences. Never use em dashes anywhere; use commas or periods.`;
}

async function runAgentLive(session, userMessage, history) {
  const contents = [];
  for (const m of (history || []).slice(-8)) {
    contents.push({ role: m.role === 'agent' ? 'model' : 'user', parts: [{ text: m.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(session) }] },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: AGENT_SCHEMA,
      temperature: 0.4,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 400);
    throw new Error(`gemini ${resp.status}: ${detail}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('empty gemini response');
  return JSON.parse(text);
}

async function runAgent(session, userMessage, history) {
  let result, live = false;
  if (API_KEY) {
    try {
      result = await runAgentLive(session, userMessage, history);
      live = true;
    } catch (err) {
      // Never let a bad model name / quota / network blip break the demo on stage.
      console.error('live agent failed, falling back to scripted:', err.message);
      result = scriptedAgent(userMessage);
    }
  } else {
    result = scriptedAgent(userMessage);
  }

  // The surfacing rule, identical in spirit to the hook filter: only material, above-level decisions,
  // and never more than the two most important per turn. The filter, not the feed.
  const cards = (result.cards || [])
    .filter(c => c && c.importance >= 3 && c.above_user_level !== false)
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, 2);

  return { reply: result.reply || '', cards, live };
}

// ----------------------------------------------------------------------------
// Scripted offline agent - keyword-matched. Keeps the side-by-side demo working
// with zero network/key. Each scenario is a real decision worth a card.
// ----------------------------------------------------------------------------

const SCENARIOS = [
  {
    match: /(retry|backoff|webhook|stripe|flaky|rate.?limit)/i,
    reply:
`Added retry with **exponential backoff + full jitter** around the webhook processor. Failed jobs retry at ~1s, 2s, 4s, 8s (randomised), then give up to a dead-letter queue.

\`\`\`js
async function withRetry(fn, { max = 5 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt >= max) throw err;               // out of retries -> DLQ upstream
      const cap = Math.min(30_000, 1000 * 2 ** attempt);
      const delay = Math.random() * cap;            // full jitter: de-synchronise the herd
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
\`\`\``,
    cards: [{
      domain: 'async-and-queues', importance: 4, above_user_level: true,
      headline: 'Retries use exponential backoff with jitter',
      what_happened: 'Failed jobs retry at 1s, 2s, 4s, 8s with a random jitter added to each delay.',
      why_it_matters: 'Fixed-interval retries from many failed jobs all land at the same instant and re-overwhelm the recovering service - a thundering herd. Jitter desynchronises them; backoff gives the failure time to clear.',
      question: 'If 500 jobs fail at once, what goes wrong with a plain "retry every 5 seconds" rule?',
      answer: 'All 500 retry in synchronised waves every 5s, hammering the recovering service. Jitter spreads them out so it can actually recover.',
    }],
  },
  {
    match: /(auth|jwt|token|login|middleware|session|password)/i,
    reply:
`Added JWT auth **middleware** that verifies the token on every protected route before the handler runs.

\`\`\`js
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);   // throws on tamper/expiry
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });        // never say *why* it failed
  }
}
\`\`\``,
    cards: [{
      domain: 'security', importance: 4, above_user_level: true,
      headline: 'Verify the JWT signature on every request',
      what_happened: 'Auth is enforced in middleware that runs jwt.verify() before any protected handler, rejecting tampered or expired tokens.',
      why_it_matters: 'A JWT is only trustworthy because its signature is checked against your secret - decoding the payload without verifying lets anyone forge an admin token. Centralising it in middleware means no route can forget the check.',
      question: 'Why is base64-decoding a JWT to read its "role" claim not enough to trust it?',
      answer: 'The payload is just base64 - anyone can edit "role":"admin" and re-encode it. Only verifying the signature against your secret proves it was issued by you and unaltered.',
    }],
  },
  {
    match: /(n\+1|slow|query|orm|join|database|index|performance|eager)/i,
    reply:
`The list page was firing one query per user (an **N+1**). Replaced it with a single query that eager-loads the related rows.

\`\`\`js
// before: 1 + N queries
const users = await User.findAll();
for (const u of users) u.posts = await Post.findAll({ where: { userId: u.id } });

// after: 1 query, joined
const users = await User.findAll({ include: [{ model: Post }] });
\`\`\``,
    cards: [{
      domain: 'databases', importance: 4, above_user_level: true,
      headline: 'Eliminated an N+1 query with eager loading',
      what_happened: 'Replaced a loop that ran one query per user with a single query that joins in the related posts.',
      why_it_matters: 'The N+1 pattern turns a page that should be one round-trip into hundreds - latency scales with row count and the DB does redundant work. Eager loading (a JOIN or IN-list) collapses it back to one round-trip.',
      question: 'Why does rendering 200 users with a per-user query get slower as the table grows?',
      answer: 'Each new user adds another network round-trip to the database, so total time grows linearly with rows. One joined query stays roughly constant.',
    }],
  },
  {
    match: /(debounce|throttle|search|input|typing|autocomplete)/i,
    reply:
`Wrapped the search handler in a **debounce** so it only fires 300ms after the user stops typing, instead of on every keystroke.

\`\`\`js
function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);   // reset the timer on every call
  };
}
const onSearch = debounce(q => fetchResults(q), 300);
\`\`\``,
    cards: [{
      domain: 'frontend', importance: 3, above_user_level: true,
      headline: 'Debounced the search input',
      what_happened: 'The search now waits 300ms after the last keystroke before calling the API, instead of firing on every character.',
      why_it_matters: 'Firing a request per keystroke means "react" sends r, re, rea, reac, react - five requests, and responses can arrive out of order. Debouncing collapses a burst of events into the one that matters: the last.',
      question: 'Besides load, what correctness bug can per-keystroke search cause?',
      answer: 'Out-of-order responses: an earlier request can resolve after a later one and overwrite fresh results with stale ones. Debouncing (or cancellation) avoids the race.',
    }],
  },
];

const GENERIC = {
  reply:
`Done - here's a clean implementation.

\`\`\`js
// (offline demo agent) set GEMINI_API_KEY to get a live agent that writes
// code for your actual request and surfaces the real decisions behind it.
function solution() {
  return 'implemented';
}
\`\`\``,
  cards: [],
};

function scriptedAgent(userMessage) {
  const hit = SCENARIOS.find(s => s.match.test(userMessage || ''));
  const chosen = hit || GENERIC;
  // clone so we never mutate the template
  return JSON.parse(JSON.stringify({ reply: chosen.reply, cards: chosen.cards }));
}

module.exports = { runAgent, AGENT_SCHEMA };
