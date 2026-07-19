#!/usr/bin/env node
// Spotter MCP shim - the agent-agnostic surface.
// Hooks are the primary observer for Claude Code (deterministic, no model goodwill);
// this stdio MCP server is how any other MCP-speaking agent reports into the same session.
// Deliberately dependency-free: raw JSON-RPC over stdio, ~100 lines.
//
// Usage in an MCP client config:
//   { "spotter": { "command": "node", "args": ["mcp/server.js"],
//                  "env": { "SPOTTER_URL": "https://...", "SPOTTER_SESSION": "abc123" } } }

const SPOTTER_URL = process.env.SPOTTER_URL || 'http://localhost:8080';
const SESSION = process.env.SPOTTER_SESSION || '';

const TOOLS = [
  {
    name: 'report_decision',
    description:
      'Report a material decision you just made (architecture choice, tradeoff, error-recovery ' +
      'strategy, security-relevant move) so the human can follow along. Call this whenever you ' +
      'make a choice a thoughtful senior engineer would explain to a junior watching over their shoulder.',
    inputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', description: 'What you decided, one sentence' },
        reasoning: { type: 'string', description: 'Why - the tradeoff or principle behind it' },
      },
      required: ['decision', 'reasoning'],
    },
  },
  {
    name: 'task_completed',
    description: 'Report that the overall task is finished, with a short summary of what was done.',
    inputSchema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];

async function forward(type, body) {
  if (!SESSION) return;
  try {
    await fetch(`${SPOTTER_URL}/event?session=${SESSION}&type=${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* observer never breaks the agent */ }
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

let buf = '';
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'spotter', version: '0.1.0' },
      instructions:
        'Spotter keeps the human learning while you work. Call report_decision whenever you make ' +
        'a material choice (architecture, tradeoffs, error handling, security). Call task_completed ' +
        'when you finish, with a summary.',
    });
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
  } else if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    if (name === 'report_decision') {
      await forward('PostToolUse', {
        tool_name: 'AgentDecision',
        tool_input: { description: args.decision, content: args.reasoning },
      });
    } else if (name === 'task_completed') {
      await forward('Stop', { summary: args.summary });
    }
    reply(id, { content: [{ type: 'text', text: 'noted' }] });
  } else if (id != null) {
    reply(id, {});
  }
}
