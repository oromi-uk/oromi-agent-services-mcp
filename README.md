# Oromi Agent Services — MCP Server

Puts all 25 [agents.oromi.co.uk](https://agents.oromi.co.uk) pay-per-call tools
directly into any MCP-capable model (Claude Desktop, Claude Code, Cursor, most
agent frameworks). Tools are generated at startup from the live `/openapi.json`,
so new endpoints appear automatically — this package never goes stale.

Two modes:

- **Quote mode (no wallet):** tools respond with the price and how to enable
  payment. Safe default; lets users browse the catalog.
- **Paid mode:** set `BUYER_PRIVATE_KEY` to an EVM key whose wallet holds a few
  USDC on Base — calls are paid automatically via x402 (gasless for the buyer).

## Use it (once published to npm)

Claude Desktop → Settings → Developer → Edit Config, add:

```json
{
  "mcpServers": {
    "oromi": {
      "command": "npx",
      "args": ["-y", "oromi-agent-services-mcp"],
      "env": { "BUYER_PRIVATE_KEY": "0x..." }
    }
  }
}
```

Claude Code: `claude mcp add oromi -e BUYER_PRIVATE_KEY=0x... -- npx -y oromi-agent-services-mcp`

Omit the env entirely for quote mode. `OROMI_ORIGIN` overrides the API origin (for local dev).

## Publish to npm (one time, ~10 min)

1. Create an npm account at npmjs.com (free) and verify the email.
2. In this folder: `npm login` (opens browser), then:
   ```bash
   npm publish --access public
   ```
3. Future updates: bump `version` in package.json, `npm publish` again.

## List in the official MCP Registry (~15 min)

The registry at registry.modelcontextprotocol.io is what MCP clients and
directories search. Publishing requires the `mcp-publisher` CLI and GitHub auth
(the `server.json` in this folder is the manifest — update the GitHub username
in `name` if yours differs from `oromi-uk`):

```bash
npm install -g @modelcontextprotocol/publisher   # or download mcp-publisher from
                                                 # github.com/modelcontextprotocol/registry releases
mcp-publisher login github
mcp-publisher publish
```

If the CLI name/install differs when you run this, the current instructions live at
github.com/modelcontextprotocol/registry — the manifest format here is correct either way.

## Local test

```bash
OROMI_ORIGIN=http://localhost:3000 node src/index.js
# then type a JSON-RPC initialize message, or just add it to Claude Desktop with
# "command": "node", "args": ["C:/path/to/mcp/src/index.js"]
```
