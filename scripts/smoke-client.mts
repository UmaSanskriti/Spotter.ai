// Real MCP client smoke test against the running Spotter HTTP server.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.SPOTTER_URL || "http://127.0.0.1:7777/mcp");
const client = new Client({ name: "smoke", version: "0.0.0" });
const transport = new StreamableHTTPClientTransport(url);
await client.connect(transport);

const caps = client.getServerVersion();
console.log("connected to:", caps?.name, caps?.version);
console.log("instructions present:", !!client.getInstructions(), "\n");

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "), "\n");

async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as any[])?.[0]?.text ?? "";
  console.log(`── ${name}(${JSON.stringify(args)})`);
  console.log(text, "\n");
  return JSON.parse(text || "{}");
}

// Simulate an agent doing a task and weaving in a rep.
const started = await call("task_started", {
  description: "write a SQL query for weekly active users by cohort",
});
await call("get_practice_directive", {
  task_context: "write a SQL query for weekly active users by cohort",
});
await call("grade_attempt", {
  user_answer: "use a CTE with date_trunc week and count distinct user_id grouped by cohort",
  reference: "CTE with date_trunc to week, count distinct user_id, group by cohort week",
  skill_id: "sql-analytics",
  confidence: 0.6,
});
await call("task_completed", {
  task_id: started.taskId,
  solution: "SELECT ...",
  reasoning: "CTE keeps it readable",
});
await call("get_skill_ledger", {});

await client.close();
console.log("✅ smoke test complete");
