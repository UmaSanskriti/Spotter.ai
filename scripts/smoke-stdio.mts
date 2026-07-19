// Validates the stdio shim (spotter.md §6: "a tiny stdio shim for clients that only
// spawn stdio servers"). Spawns `spotter serve --stdio` and speaks MCP over stdio.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/cli.ts", "serve", "--stdio"],
  env: { ...process.env } as Record<string, string>,
});
const client = new Client({ name: "smoke-stdio", version: "0.0.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("stdio tools:", tools.tools.map((t) => t.name).join(", "));
const r = await client.callTool({
  name: "get_delegation_mirror",
  arguments: { window_days: 60 },
});
const text = (r.content as any[])?.[0]?.text ?? "{}";
console.log("mirror headline:", JSON.parse(text).headline);
await client.close();
console.log("✅ stdio shim works");
