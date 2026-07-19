// Stage 2 of the Spotter Filter: Gemini decides, per decision,
// "does this matter, and is it above this user's level?"
// Uses the REST API directly (stable surface, no SDK version surprises).

// Model candidates tried in order; first one that answers gets pinned for the process lifetime.
const MODEL_CANDIDATES = [
  process.env.SPOTTER_MODEL,
  process.env.GEMINI_MODEL,
  'gemini-3.1-pro',
  'gemini-flash-latest',
  'gemini-2.5-flash',
].filter(Boolean);
let pinnedModel = null;
const API_KEY = process.env.GEMINI_API_KEY || '';
const CARD_BUDGET_MS = Number(process.env.SPOTTER_CARD_BUDGET_MS || 90_000); // max ~1 card / 90s

// Diagnostics surfaced at /healthz — so a broken deploy tells you *why* from the outside.
const diag = {
  geminiKeySet: Boolean(API_KEY),
  model: null,
  cardBudgetMs: CARD_BUDGET_MS,
  filterCalls: 0,
  cardsSurfaced: 0,
  suppressed: { budget: 0, belowBar: 0 },
  lastError: null,
  lastVerdict: null,
};

const CARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    surface: { type: 'BOOLEAN', description: 'Is this decision worth interrupting the user for?' },
    importance: { type: 'INTEGER', description: '1-5. 5 = an architectural fork in the road.' },
    domain: { type: 'STRING', description: 'One of the profile domain keys.' },
    above_user_level: { type: 'BOOLEAN', description: 'Is this above the user\'s current level in that domain?' },
    headline: { type: 'STRING', description: 'Max 10 words. The decision, not the activity.' },
    what_happened: { type: 'STRING', description: 'One sentence, plain language.' },
    why_it_matters: { type: 'STRING', description: 'The theoretical underpinning. Two sentences max.' },
    question: { type: 'STRING', description: 'One retrieval question the user should be able to answer.' },
    answer: { type: 'STRING', description: 'Reference answer, two sentences max.' },
  },
  required: ['surface', 'importance', 'domain', 'above_user_level', 'headline',
             'what_happened', 'why_it_matters', 'question', 'answer'],
};

function buildPrompt(session, event) {
  const profileLines = Object.entries(session.profile)
    .map(([d, l]) => `  ${d}: level ${l}/3`).join('\n');
  const recent = session.keptEvents.slice(-6, -1)
    .map(e => `- [${e.tool || e.hook}] ${summarizeEvent(e)}`).join('\n') || '(none)';

  return `You are Spotter, an observer riding along on an AI coding agent's session.
The human delegated this work and is watching from a second screen. Your job is to decide
whether THIS event contains a decision worth teaching them — and to stay silent otherwise.
Silence is a feature. Only material decisions with a real "why" behind them deserve a card:
architectural choices, tradeoffs, error-recovery strategy, security-relevant moves.
Routine edits, boilerplate, and mechanical steps do not.

USER PROFILE (domain: level, 1=beginner 3=strong — surface only what is ABOVE their level):
${profileLines}

RECENT SESSION CONTEXT:
${recent}

CURRENT EVENT:
tool: ${event.tool || event.hook}
detail: ${summarizeEvent(event)}

Decide. If you surface, write for a smart person who didn't watch the work happen:
headline names the decision, why_it_matters gives the underlying principle, and the
question is answerable from the card alone after a beat of thought.`;
}

function summarizeEvent(event) {
  const input = event.input || {};
  const parts = [];
  if (input.file_path) parts.push(`file: ${input.file_path}`);
  if (input.command) parts.push(`cmd: ${String(input.command).slice(0, 300)}`);
  if (input.content) parts.push(`content: ${String(input.content).slice(0, 1200)}`);
  if (input.new_string) parts.push(`edit: ${String(input.new_string).slice(0, 1200)}`);
  if (input.description) parts.push(`desc: ${input.description}`);
  if (event.summary) parts.push(`summary: ${String(event.summary).slice(0, 1200)}`);
  return parts.join(' | ') || JSON.stringify(event).slice(0, 400);
}

async function callGemini(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function runFilter(session, event) {
  if (!API_KEY) {
    diag.lastError = 'GEMINI_API_KEY not set — filter disabled, ingest still works';
    return null;
  }
  if (Date.now() - session.lastCardAt < CARD_BUDGET_MS) {
    diag.suppressed.budget += 1;
    return null; // hard budget: max ~1 card per window
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(session, event) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CARD_SCHEMA,
      temperature: 0.2,
    },
  };

  diag.filterCalls += 1;
  let resp = null;
  const candidates = pinnedModel ? [pinnedModel] : MODEL_CANDIDATES;
  for (const model of candidates) {
    resp = await callGemini(model, body);
    if (resp.ok) {
      pinnedModel = model;
      diag.model = model;
      break;
    }
    const errText = (await resp.text()).slice(0, 300);
    diag.lastError = `${model}: HTTP ${resp.status} ${errText}`;
    console.error('gemini error', model, resp.status, errText);
    if (resp.status !== 404 && resp.status !== 400) break; // only model-name issues fall through
  }
  if (!resp || !resp.ok) return null;

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) { diag.lastError = 'empty response from model'; return null; }

  let card;
  try { card = JSON.parse(text); } catch { diag.lastError = 'unparseable model output'; return null; }

  diag.lastVerdict = {
    surface: card.surface, importance: card.importance,
    above_user_level: card.above_user_level, domain: card.domain, headline: card.headline,
  };

  // The surfacing rule, exactly as designed: surface && importance>=3 && above_user_level.
  if (!(card.surface && card.importance >= 3 && card.above_user_level)) {
    diag.suppressed.belowBar += 1;
    return null;
  }
  diag.cardsSurfaced += 1;
  return card;
}

module.exports = { runFilter, CARD_SCHEMA, diag };
