// Stage 1 of the Spotter Filter: cheap, deterministic, no model.
// Kills ~80% of events before they ever cost a Gemini call.
// Silence is a feature — a firehose of teaching moments is the same failure as a firehose of logs.

const DROP_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'LS', 'TodoWrite', 'TodoRead', 'TaskList', 'TaskGet',
  'WebSearch', 'NotebookRead', 'ListMcpResourcesTool',
]);

const KEEP_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Task']);

// Bash commands that are just looking around, not deciding anything.
const TRIVIAL_BASH = /^\s*(ls|cat|head|tail|pwd|echo|which|env|git\s+(status|log|diff|branch)|find|wc|grep|rg)\b/;

function preFilter(event) {
  const { hook, tool, input } = event;

  // Session end is always interesting — it carries the agent's own summary.
  if (hook === 'Stop' || hook === 'SubagentStop') return true;

  if (hook === 'PostToolUse') {
    if (!tool) return false;
    if (DROP_TOOLS.has(tool)) return false;
    if (KEEP_TOOLS.has(tool)) return true;
    if (tool === 'Bash') {
      const cmd = (input && (input.command || '')) || '';
      return !TRIVIAL_BASH.test(cmd);
    }
    // Unknown tools: keep. Better a wasted filter call than a missed decision.
    return true;
  }

  return false;
}

module.exports = { preFilter };
