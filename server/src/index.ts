import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

// stdout is reserved for MCP protocol messages. Anything for humans goes to stderr, and never contains keys or certificate data.
const log = (m: string) => process.stderr.write(`[${SERVER_NAME}] ${m}\n`);

async function main() {
  const server = createServer(() => ({ apiKey: process.env.NAMERISE_API_KEY }));
  await server.connect(new StdioServerTransport());
  log(`v${SERVER_VERSION} ready (stdio)${process.env.NAMERISE_API_KEY ? "" : "; NAMERISE_API_KEY is not set, checks will fail until it is"}`);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
