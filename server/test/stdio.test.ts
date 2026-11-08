import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const dist = fileURLToPath(new URL("../dist/index.js", import.meta.url));

// Runs the built bundle exactly as Cursor would (node dist/index.js over stdio). No network is used:
// only calls that fail before any request are made.
describe.skipIf(!existsSync(dist))("built bundle over stdio", () => {
  it("initialises, lists the tool and fails safely without a key", async () => {
    const transport = new StdioClientTransport({ command: "node", args: [dist], env: { PATH: process.env.PATH ?? "" }, stderr: "pipe" });
    const client = new Client({ name: "stdio-test", version: "0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["check_namerise_certificate"]);
      const r = (await client.callTool({ name: "check_namerise_certificate", arguments: { certificate_id: "a".repeat(64) } })) as unknown as { isError?: boolean; structuredContent?: { error_code?: string } };
      expect(r.isError).toBe(true);
      expect(r.structuredContent?.error_code).toBe("missing_credentials");
    } finally {
      await client.close();
    }
  }, 20_000);
});
