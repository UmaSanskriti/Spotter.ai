// Resume → profile. The PDF goes straight to Gemini (it reads PDFs natively) —
// no parsing dependency, and the profile is derived bottom-up from the user's own history.

const { generateJSON } = require('./gemini');

const PROFILE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    role: { type: 'STRING', description: 'Inferred current role, e.g. "backend engineer, ~2 years"' },
    summary: {
      type: 'STRING',
      description: 'One warm sentence, addressed to the user, about what Spotter will protect for them.',
    },
    domains: {
      type: 'ARRAY',
      description: '6-8 practice-able skill domains derived from THIS resume, not a generic taxonomy.',
      items: {
        type: 'OBJECT',
        properties: {
          key: { type: 'STRING', description: 'kebab-case id, e.g. "async-and-queues"' },
          label: { type: 'STRING', description: 'Human label, e.g. "Async & queues"' },
          level: { type: 'INTEGER', description: '1=beginner 2=working 3=strong, judged from the resume' },
          evidence: { type: 'STRING', description: 'Short phrase quoting why, e.g. "built Kafka pipeline at Acme"' },
        },
        required: ['key', 'label', 'level', 'evidence'],
      },
    },
  },
  required: ['role', 'summary', 'domains'],
};

const PROMPT = `You are Spotter's onboarding analyst. Read this person's resume/CV and build their
skill profile. Derive 6-8 PRACTICE-ABLE technical/professional domains from what they have actually
done — specific enough that a coding-agent session could touch them (e.g. "sql-and-data-modeling",
"api-design", "concurrency", "testing-strategy", "systems-design", "security-basics", "devops-and-deploy",
"frontend-architecture"). Rate each 1-3 from seniority signals in the resume: 1 = little/no evidence
(they'd learn a lot here), 2 = working knowledge, 3 = strong (rarely worth interrupting them about).
Prefer including 1-2 domains they clearly HAVEN'T mastered but their trajectory needs — those are
where Spotter helps most. Be generous and encouraging in tone, precise in judgment.`;

async function buildProfile({ text, fileB64, mime }) {
  const parts = [];
  if (fileB64) parts.push({ inline_data: { mime_type: mime || 'application/pdf', data: fileB64 } });
  if (text) parts.push({ text: `RESUME TEXT:\n${String(text).slice(0, 20_000)}` });
  parts.push({ text: PROMPT });
  const result = await generateJSON(parts, PROFILE_SCHEMA, 0.3);
  if (!result || !Array.isArray(result.domains) || result.domains.length === 0) return null;
  result.domains = result.domains.slice(0, 8).map(d => ({
    ...d,
    key: String(d.key || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    level: Math.min(3, Math.max(1, Number(d.level) || 1)),
  }));
  return result;
}

module.exports = { buildProfile };
