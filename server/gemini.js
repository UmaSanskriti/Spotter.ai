// Shared Gemini REST helper: structured-output generation with model-name fallback.
// First model that answers gets pinned for the process lifetime.

const MODEL_CANDIDATES = [
  process.env.SPOTTER_MODEL,
  process.env.GEMINI_MODEL, // .env.example compat
  'gemini-3.1-pro',
  'gemini-flash-latest',
  'gemini-2.5-flash',
].filter(Boolean);

// Accept whatever the host injects. Google AI Studio's app deploy provides the key as
// API_KEY; the @google/genai SDK convention is GOOGLE_API_KEY; we've documented GEMINI_API_KEY.
// Take the first one that's set so an AI Studio import "just works" with zero config.
const API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.GENAI_API_KEY ||
  '';
let pinnedModel = null;

const state = {
  get keySet() { return Boolean(API_KEY); },
  get model() { return pinnedModel; },
  lastError: null,
};

async function generateJSON(parts, schema, temperature = 0.2) {
  if (!API_KEY) {
    state.lastError = 'GEMINI_API_KEY not set';
    return null;
  }
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature,
    },
  };

  let resp = null;
  const candidates = pinnedModel ? [pinnedModel] : MODEL_CANDIDATES;
  for (const model of candidates) {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (resp.ok) { pinnedModel = model; break; }
    const errText = (await resp.text()).slice(0, 300);
    state.lastError = `${model}: HTTP ${resp.status} ${errText}`;
    console.error('gemini error', model, resp.status, errText);
    if (resp.status !== 404 && resp.status !== 400) break; // only model-name issues fall through
  }
  if (!resp || !resp.ok) return null;

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) { state.lastError = 'empty response from model'; return null; }
  try { return JSON.parse(text); } catch { state.lastError = 'unparseable model output'; return null; }
}

module.exports = { generateJSON, state };
