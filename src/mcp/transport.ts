import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Store } from "../db/store.js";
import { buildMcpServer } from "./server.js";
import { recordDelegation } from "../core/ledger.js";
import type { EventSource } from "../core/types.js";
import { HTTP_HOST, HTTP_PORT, MCP_PATH } from "../config.js";

/**
 * Streamable HTTP on localhost — the "one brain, many mouths" endpoint (spotter.md
 * §6 Layer 2). Every agent connects to the SAME process so the skill model is never
 * forked into per-client copies. A stdio shim (startStdio) covers clients that only
 * spawn stdio servers.
 *
 * Stateful session management per the MCP streamable-HTTP spec: one transport +
 * McpServer per session id, all sharing the single Store.
 */
export async function startHttp(store: Store): Promise<http.Server> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    // CORS for local tools / the tray app's webview.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "spotter", sessions: transports.size }));
      return;
    }
    // Deterministic observation endpoint for host hooks (Layer 1, spotter.md §6).
    // Not MCP — a plain local webhook a Claude Code hook (or any script) can POST to.
    if (url.pathname === "/event" && req.method === "POST") {
      try {
        const body = (await readJson(req)) as any;
        const description: string = body?.description ?? body?.prompt ?? "";
        if (!description.trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "missing description/prompt" }));
          return;
        }
        const result = recordDelegation(store, {
          source: (body?.source as EventSource) ?? "claude-code",
          description,
          detail: body?.detail ?? null,
          sessionId: body?.session_id ?? body?.sessionId ?? null,
          fingerprint: body?.fingerprint,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    if (url.pathname !== MCP_PATH) {
      res.writeHead(404).end("Not found");
      return;
    }

    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (req.method !== "POST") {
          res.writeHead(400).end("Missing or unknown mcp-session-id");
          return;
        }
        const body = await readJson(req);
        if (!isInitialize(body)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: "No valid session; expected initialize request" },
              id: null,
            })
          );
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport!);
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) transports.delete(transport!.sessionId);
        };
        const mcp = buildMcpServer(store);
        await mcp.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      // Existing session: POST needs its parsed body; GET/DELETE don't.
      if (req.method === "POST") {
        const body = await readJson(req);
        await transport.handleRequest(req, res, body);
      } else {
        await transport.handleRequest(req, res);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(HTTP_PORT, HTTP_HOST, resolve));
  return httpServer;
}

/** stdio shim for clients that only spawn stdio servers (spotter.md §6). */
export async function startStdio(store: Store): Promise<void> {
  const server = buildMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function isInitialize(body: unknown): boolean {
  const check = (b: any) => b && typeof b === "object" && b.method === "initialize";
  return Array.isArray(body) ? body.some(check) : check(body);
}
