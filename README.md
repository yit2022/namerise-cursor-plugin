# NameRise Certificate Check (Cursor plugin / MCP server)

Read-only connector for the NameRise **Certificate Check API**. Give it a Namesake Clearance Certificate ID and it returns the certificate's status, what the subject declared, their listed sources and accounts, and whether NameRise's tamper-evident record chain is intact.

## What it is, and is not

- A certificate is the subject's **own declaration**, published on NameRise and recorded in a hash chain. It is **not government-ID verification**, and NameRise has not checked identity documents. Keep your own KYC steps.
- This connector does one thing: `GET https://namerise.app/api/v1/certificates/{id}`. It has no AI-visibility checks, no name search and no publishing features.
- Nothing here makes Google or any AI model change its answers.

## Tool

`check_namerise_certificate` (read-only)

| Input | Type | Notes |
|---|---|---|
| `certificate_id` | string | 64 hexadecimal characters. Case and surrounding spaces are normalised. |

Output: `status` (`valid`, `expired`, `revoked`, `tampered`), `valid`, `subject`, `statement`, `not_confused_with`, `sources`, `verified_accounts`, `issued_at`, `expires_at`, `revoked_at`, `recorded_at`, `chain`, `basis`, `human_url`, `checked_at`. Only treat `status: "valid"` as clearing a hit.

Failures come back as tool errors with a code: `invalid_certificate_id`, `missing_credentials`, `invalid_credentials_format`, `unauthorized` (401), `forbidden` (403), `not_found` (404), `rate_limited` (429, monthly quota), `timeout`, `network_error`, `upstream_error`, `unexpected_response`.

## Requirements

- Node.js 20 or newer.
- A NameRise API key (`nrk_live_...`). Email support@namerise.app with your organisation and expected monthly volume. See https://namerise.app/developers.

Each successful or failed check that reaches NameRise is logged against your key and counts toward your monthly quota.

## Install

### A. Cursor plugin (once published)

Install from the Cursor Marketplace, then set the plugin variable `NAMERISE_API_KEY` in the Cursor dashboard under Plugins. The key is never stored in this repository.

### B. Local install from a clone (works today)

```bash
git clone <this-repo-url> namerise-cursor-plugin
cd namerise-cursor-plugin/server
npm ci
npm run check        # typecheck, tests, build
```

The built server (`server/dist/index.js`) is committed, so a clone also runs without `npm ci`. Then add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project), using the absolute path to your clone:

```json
{
  "mcpServers": {
    "namerise-certificate-check": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/namerise-cursor-plugin/server/dist/index.js"],
      "env": { "NAMERISE_API_KEY": "${env:NAMERISE_API_KEY}" }
    }
  }
}
```

Export `NAMERISE_API_KEY` in the environment Cursor is started from, then restart Cursor. A ready-made copy is in `examples/cursor-mcp.json`.

### Try it without Cursor

```bash
cd server && npx @modelcontextprotocol/inspector node dist/index.js
```

## Safety design

- Host fixed to `https://namerise.app`; the key is validated locally and never sent anywhere else; redirects are not followed.
- Input is validated before any request. Responses are validated against the documented schema; anything else is reported as `unexpected_response`.
- 10-second timeout per attempt. At most 2 retries, only for network errors, timeouts and 502/503/504. Never for 401, 403, 404 or 429. A retry that reaches NameRise may count toward your quota.
- Response bodies over 256 KB are rejected.
- No key, certificate data or subject data is logged or stored. Stdout carries only MCP messages.
- Certificate text is third-party data, returned between BEGIN/END markers with an untrusted-data notice.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `missing_credentials` | `NAMERISE_API_KEY` is not reaching the server. Set it, restart Cursor. |
| `invalid_credentials_format` | The key should look like `nrk_live_` plus 32 characters. Check for stray quotes or spaces. |
| `unauthorized` | The key is wrong or revoked. Ask support@namerise.app. |
| `rate_limited` | Monthly quota used up. Ask support@namerise.app to raise it. |
| `not_found` | No certificate has that ID. Check you copied all 64 characters. |
| `timeout` / `network_error` | Check connectivity to https://namerise.app, then retry. |
| Server does not start | Run `node --version` (need 20+), then `node server/dist/index.js` and read stderr. |

## Development

```bash
cd server
npm ci
npm run check     # tsc, vitest (mocked), esbuild bundle
```

Tests use mocked HTTP. They cover success, invalid IDs, missing key, 401, 403, 404, 429, timeouts, retries, redirects, malformed and oversized responses, MCP initialise/list/call, and the built bundle over stdio. Live verification against the real API needs a real key and a real certificate ID and is not part of the test suite.

## Licence

MIT, copyright Tamalaki Business Network Ltd. See `LICENSE`.
