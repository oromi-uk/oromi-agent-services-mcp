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

## Tools

- **oromi_catalog** — FREE: list every endpoint with price, network and description
- **uk_business_search** — $0.005 · Search the UK Companies House register by name or keyword
- **uk_business_company** — $0.01 · Full company profile: status, SIC codes, registered office, officers
- **uk_business_name_check** — $0.01 · Business-name availability verdict against the live register
- **uk_business_food_hygiene** — $0.01 · Official FSA food hygiene ratings for any UK food business
- **uk_business_due_diligence** — $0.10 · Composite: company + officers + domain trust + website scan with red-flag assessment
- **uk_official_rates** — $0.005 · Current UK statutory figures: Bank Rate (live), CPI, minimum wage, tax/NI thresholds, VAT, SDLT bands — with official source URLs
- **uk_property_price_trends** — $0.02 · House Price Index history for any UK area (HM Land Registry)
- **uk_property_sold_prices** — $0.02 · Actual sold-property transactions by postcode (Price Paid Data)
- **uk_property_market_summary** — $0.03 · One-call area investment context: prices, momentum, volume trend
- **uk_property_area_crime** — $0.02 · Street-level crime context for any UK postcode
- **uk_property_mortgage_context** — $0.005 · Exact mortgage repayment maths + rate stress test
- **uk_property_epc** — $0.02 · Energy Performance Certificates by postcode (England & Wales register)
- **verify_email** — $0.005 · Deliverability checks: syntax, MX records, disposable-domain detection
- **verify_domain** — $0.01 · Domain trust signals: registration age (RDAP), DNS, HTTPS
- **verify_vat_eu** — $0.01 · Official EU VIES VAT number validation
- **verify_iban** — $0.002 · Offline IBAN structure and checksum validation
- **util_uk_working_days** — $0.002 · Working-day maths against the official UK bank-holiday calendar
- **util_fx** — $0.002 · Currency conversion at ECB reference rates
- **util_validate_json** — $0.002 · Validate JSON data against a JSON Schema with precise errors
- **web_extract** — $0.01 · Any web page → clean readable text
- **web_pdf_extract** — $0.02 · Any PDF URL → text (most agent models cannot read PDFs)
- **web_url_status** — $0.001 · Citation insurance: does this URL resolve, where does it redirect
- **web_robots_check** — $0.002 · robots.txt crawl-permission check for any URL + user-agent
- **agent_ready_scan** — $0.05 · Website → structured agent-usable data + 0–100 agent-readiness score
- **crypto_context** — $0.005 · Crypto market context: price, volatility regime, range position

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
