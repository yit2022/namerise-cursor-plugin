import { describe, expect, it, vi } from "vitest";
import { checkCertificate, normaliseCertificateId } from "../src/client.js";
import { ID, KEY, found, json } from "./fixtures.js";

const sleep = vi.fn(async () => {});
const run = (fetchImpl: typeof fetch, over: Record<string, unknown> = {}) => checkCertificate(ID, { apiKey: KEY, fetchImpl, sleep, timeoutMs: 50, ...over });

describe("success", () => {
  it("returns the validated certificate and calls only namerise.app with the bearer key", async () => {
    const f = vi.fn(async () => json(found()));
    const r = await run(f as never);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://namerise.app/api/v1/certificates/${ID}`);
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    if (r.ok) expect(r.data.status).toBe("valid");
  });
  it("normalises case and whitespace in the ID", async () => {
    expect(normaliseCertificateId(`  ${ID.toUpperCase()} `)).toBe(ID);
  });
  it("drops a human_url that points at another host", async () => {
    const r = await run((async () => json(found({ human_url: "https://evil.example/x" }))) as never);
    expect(r.ok && r.data.human_url).toBeUndefined();
  });
  it("passes through expired, revoked and tampered statuses", async () => {
    for (const status of ["expired", "revoked", "tampered"] as const) {
      const r = await run((async () => json(found({ status, valid: false }))) as never);
      expect(r.ok && r.data.status).toBe(status);
    }
  });
});

describe("input and credentials", () => {
  it.each(["", "abc", "g".repeat(64), "a".repeat(63), 123 as never, "../../etc/passwd"])("rejects invalid ID %j without any request", async (bad) => {
    const f = vi.fn();
    const r = await checkCertificate(bad, { apiKey: KEY, fetchImpl: f as never });
    expect(r).toMatchObject({ ok: false, code: "invalid_certificate_id" });
    expect(f).not.toHaveBeenCalled();
  });
  it("fails clearly without a key and sends nothing", async () => {
    const f = vi.fn();
    expect(await checkCertificate(ID, { apiKey: undefined, fetchImpl: f as never })).toMatchObject({ ok: false, code: "missing_credentials" });
    expect(await checkCertificate(ID, { apiKey: "  ", fetchImpl: f as never })).toMatchObject({ ok: false, code: "missing_credentials" });
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects a malformed key locally", async () => {
    const f = vi.fn();
    expect(await checkCertificate(ID, { apiKey: "sk-not-ours", fetchImpl: f as never })).toMatchObject({ ok: false, code: "invalid_credentials_format" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("HTTP errors", () => {
  it("401 -> unauthorized, no retry", async () => {
    const f = vi.fn(async () => json({ error: "Invalid or revoked API key." }, 401));
    expect(await run(f as never)).toMatchObject({ ok: false, code: "unauthorized", httpStatus: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("403 -> forbidden", async () => {
    expect(await run((async () => json({ error: "nope" }, 403)) as never)).toMatchObject({ ok: false, code: "forbidden" });
  });
  it("404 -> not_found, no retry", async () => {
    const f = vi.fn(async () => json({ object: "certificate_check", found: false, error: "No certificate with this ID." }, 404));
    expect(await run(f as never)).toMatchObject({ ok: false, code: "not_found" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("429 -> rate_limited with Retry-After, no retry", async () => {
    const f = vi.fn(async () => json({ error: "Monthly quota reached." }, 429, { "retry-after": "120" }));
    expect(await run(f as never)).toMatchObject({ ok: false, code: "rate_limited", retryAfterSeconds: 120 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("redirects are not followed", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }));
    expect(await run(f as never)).toMatchObject({ ok: false, code: "unexpected_response" });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("transient failures", () => {
  it("retries 503 up to the bound, then reports upstream_error", async () => {
    const f = vi.fn(async () => json({ error: "down" }, 503));
    expect(await run(f as never)).toMatchObject({ ok: false, code: "upstream_error", httpStatus: 503 });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("recovers when a retry succeeds", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n < 2 ? json({ error: "bad gateway" }, 502) : json(found())));
    expect((await run(f as never)).ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("500 is not retried", async () => {
    const f = vi.fn(async () => json({ error: "boom" }, 500));
    expect(await run(f as never)).toMatchObject({ ok: false, code: "upstream_error" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("times out when the server hangs, and retries within the bound", async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const r = await run(f as never, { maxRetries: 1 });
    expect(r).toMatchObject({ ok: false, code: "timeout" });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("network errors become network_error without leaking details", async () => {
    const r = await run((async () => { throw new TypeError(`fetch failed for Bearer ${KEY}`); }) as never, { maxRetries: 0 });
    expect(r).toMatchObject({ ok: false, code: "network_error" });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
});

describe("malformed upstream data", () => {
  it.each([
    ["not JSON", () => new Response("<html>oops</html>", { status: 200 })],
    ["missing fields", () => json({ object: "certificate_check", found: true })],
    ["wrong status value", () => json(found({ status: "pending" }))],
    ["wrong object type", () => json(found({ object: "something_else" }))],
    ["id not 64 hex", () => json(found({ id: "short" }))],
    ["found:false with 200", () => json({ object: "certificate_check", found: false })],
    ["array body", () => json([])],
  ])("%s -> unexpected_response", async (_n, make) => {
    expect(await run((async () => make()) as never)).toMatchObject({ ok: false, code: "unexpected_response" });
  });
  it("rejects oversized bodies", async () => {
    const big = new Response("x".repeat(300_000), { status: 200, headers: { "content-length": "300000" } });
    expect(await run((async () => big) as never)).toMatchObject({ ok: false, code: "unexpected_response" });
  });
  it("ignores extra unknown fields", async () => {
    expect((await run((async () => json(found({ future_field: 1 }))) as never)).ok).toBe(true);
  });
});
