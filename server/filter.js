// Stage 2 of the Spotter Filter: Gemini decides, per decision,
// "does this matter, and is it above this user's level?"
// Uses the REST API directly (stable surface, no SDK version surprises).

const MODEL = process.env.SPOTTER_MODEL || 'gemini-3.1-pro';
const API_KEY = process.env.GEMINI_API_KEY || '';
const CARD_BUDGET_MS = Number(process.env.SPOTTER_CARD_BUDGET_MS || 90_000); // max ~1 card / 90s

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

async function runFilter(session, event) {
  if (!API_KEY) return null; // no key configured — ingest still works, cards don't fire
  if (Date.now() - session.lastCardAt < CARD_BUDGET_MS) return null; // hard budget

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(session, event) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CARD_SCHEMA,
      temperature: 0.2,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error('gemini error', resp.status, (await resp.text()).slice(0, 500));
    return null;
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  let card;
  try { card = JSON.parse(text); } catch { return null; }

  // The surfacing rule, exactly as designed: surface && importance>=3 && above_user_level.
  if (!(card.surface && card.importance >= 3 && card.above_user_level)) return null;
  return card;
}

module.exports = { runFilter, CARD_SCHEMA };
