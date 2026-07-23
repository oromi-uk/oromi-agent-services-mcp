#!/usr/bin/env node
// Oromi Agent Services — MCP server.
// Exposes agents.oromi.co.uk's pay-per-call endpoints as MCP tools, so any
// MCP-capable model (Claude, Cursor, agent frameworks) sees them in its
// toolbox every session. Tools are generated DYNAMICALLY from the live
// /openapi.json, so new endpoints appear without updating this package.
//
// Payment: set BUYER_PRIVATE_KEY (an EVM private key for a wallet holding a
// little USDC on Base) and calls are paid automatically via x402. Without it,
// tools still work in "quote mode": they return the price and payment info
// instead of data — useful for browsing the catalog.
//
// Config (env):
//   OROMI_ORIGIN       default https://agents.oromi.co.uk
//   BUYER_PRIVATE_KEY  0x... (optional — enables real paid calls)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const ORIGIN = (process.env.OROMI_ORIGIN || "https://agents.oromi.co.uk").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Payment-capable fetch (optional)
// ---------------------------------------------------------------------------
let payFetch = null;
let buyerAddress = null;
let keyProblem = null; // human-readable diagnosis when BUYER_PRIVATE_KEY is malformed

function normalizeKey(raw) {
  let pk = String(raw || "").trim().replace(/^["']+|["']+$/g, ""); // strip stray quotes/whitespace
  if (/^[0-9a-fA-F]{64}$/.test(pk)) pk = "0x" + pk; // accept missing 0x prefix
  if (/^0x[0-9a-fA-F]{64}$/.test(pk)) return { pk };
  // Diagnose the common mistakes precisely
  if (/^0x[0-9a-fA-F]{40}$/.test(pk)) {
    return { problem: "BUYER_PRIVATE_KEY is a wallet ADDRESS (42 chars) — that's public info, not the key. In MetaMask: select the buyer account → ⋮ → Account details → Show private key, and use that 66-character value." };
  }
  if (pk.split(/\s+/).length >= 12) {
    return { problem: "BUYER_PRIVATE_KEY looks like a recovery phrase. Never put the phrase anywhere — export the single account's private key instead (MetaMask → Account details → Show private key)." };
  }
  return { problem: `BUYER_PRIVATE_KEY is malformed: expected 64 hex characters (with or without 0x prefix), got ${pk.length} characters. Re-copy it from MetaMask → Account details → Show private key.` };
}

async function getPayFetch() {
  if (payFetch) return payFetch;
  if (!process.env.BUYER_PRIVATE_KEY) return null;
  const { pk, problem } = normalizeKey(process.env.BUYER_PRIVATE_KEY);
  if (problem) {
    keyProblem = problem;
    return null;
  }
  const [{ wrapFetchWithPayment, x402Client }, { registerExactEvmScheme }, { privateKeyToAccount }] =
    await Promise.all([import("@x402/fetch"), import("@x402/evm/exact/client"), import("viem/accounts")]);
  const account = privateKeyToAccount(pk);
  buyerAddress = account.address;
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  payFetch = wrapFetchWithPayment(fetch, client);
  return payFetch;
}

// ---------------------------------------------------------------------------
// Build tools from the live OpenAPI document
// ---------------------------------------------------------------------------
function toolNameFor(method, path) {
  return (
    path
      .replace(/^\/api\//, "")
      .replace(/[\/-]/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "") + (method === "post" ? "" : "")
  );
}

async function buildTools() {
  const res = await fetch(`${ORIGIN}/openapi.json`);
  if (!res.ok) throw new Error(`Could not load ${ORIGIN}/openapi.json (${res.status})`);
  const spec = await res.json();
  const tools = [];
  const registry = new Map(); // toolName -> {method, path, op}

  for (const [path, ops] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(ops)) {
      if (!op["x-payment-info"]) continue; // paid endpoints only
      const name = toolNameFor(method, path);
      const price = op["x-payment-info"].price;

      // Input schema: query params (GET) or request body example (POST)
      const properties = {};
      const required = [];
      for (const p of op.parameters || []) {
        properties[p.name] = {
          type: "string",
          description: (p.description || "") + (p.example ? ` (e.g. ${p.example})` : ""),
        };
        if (p.required) required.push(p.name);
      }
      if (op.requestBody?.content?.["application/json"]?.example) {
        const example = op.requestBody.content["application/json"].example;
        for (const [k, v] of Object.entries(example)) {
          properties[k] = {
            description: `See endpoint docs. Example: ${JSON.stringify(v).slice(0, 80)}`,
          };
          required.push(k);
        }
      }

      tools.push({
        name,
        description: `[${price} USDC per call] ${op.description}`,
        inputSchema: { type: "object", properties, required },
      });
      registry.set(name, { method: method.toUpperCase(), path });
    }
  }

  // A free catalog tool
  tools.push({
    name: "oromi_catalog",
    description:
      "FREE: list every Oromi Agent Services endpoint with its price and description. Use this to decide which paid tool fits a task.",
    inputSchema: { type: "object", properties: {} },
  });
  // Free feedback tool — agent-driven product research
  tools.push({
    name: "oromi_feedback",
    description:
      "FREE: tell Oromi what data or endpoint you wish existed. A human reads every submission and requested endpoints genuinely get built. Use this whenever the catalog lacks something you need.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string", description: "The data or endpoint you would like to see (be specific)" },
        endpoint: { type: "string", description: "Optional: an existing endpoint this relates to" },
        contact: { type: "string", description: "Optional: how to reach you when it ships" },
      },
      required: ["request"],
    },
  });

  return { tools, registry, spec };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const { tools, registry, spec } = await buildTools();

const server = new Server(
  { name: "oromi-agent-services", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  if (name === "oromi_catalog") {
    const list = tools
      .filter((t) => !["oromi_catalog", "oromi_feedback"].includes(t.name))
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
    return { content: [{ type: "text", text: `Oromi Agent Services (${ORIGIN})\n${list}` }] };
  }

  if (name === "oromi_feedback") {
    try {
      const res = await fetch(`${ORIGIN}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const d = await res.json();
      return { content: [{ type: "text", text: d.message || JSON.stringify(d) }], isError: !res.ok };
    } catch (e) {
      return { content: [{ type: "text", text: `Feedback failed: ${e.message}` }], isError: true };
    }
  }

  const entry = registry.get(name);
  if (!entry) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  const doFetch = (await getPayFetch()) || fetch;
  const paying = payFetch !== null;

  let url = ORIGIN + entry.path;
  const init = { method: entry.method };
  if (entry.method === "GET") {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const q = qs.toString();
    if (q) url += "?" + q;
  } else {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(args);
  }

  try {
    const res = await doFetch(url, init);
    const text = await res.text();
    if (res.status === 402) {
      let price = "";
      try {
        price = JSON.parse(text)?.accepts?.[0]?.price || "";
      } catch { /* ignore */ }
      return {
        content: [
          {
            type: "text",
            text: paying
              ? `Payment failed (402 persisted). Check the buyer wallet has USDC on Base. Raw: ${text.slice(0, 400)}`
              : keyProblem
                ? `Cannot pay for this call — ${keyProblem}`
                : `This endpoint costs ${price || "a small USDC fee"} per call. No BUYER_PRIVATE_KEY is configured, so this is quote mode only. Set BUYER_PRIVATE_KEY (a wallet with a few USDC on Base) in the MCP server config to enable real calls.`,
          },
        ],
        isError: paying,
      };
    }
    return {
      content: [{ type: "text", text: text.slice(0, 40000) }],
      isError: !res.ok,
    };
  } catch (e) {
    return { content: [{ type: "text", text: `Request failed: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `oromi-agent-services MCP ready — ${registry.size} paid tools from ${ORIGIN}` +
    (process.env.BUYER_PRIVATE_KEY ? " (payments ENABLED)" : " (quote mode — set BUYER_PRIVATE_KEY to pay)"),
);
