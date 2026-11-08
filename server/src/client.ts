import { API_KEY_RE, CERTIFICATE_ID_RE, ErrorBodySchema, FoundResponseSchema, type ErrorCode, type FoundResponse } from "./schema.js";

/** The only host this connector will ever send the API key to. */
export const API_ORIGIN = "https://namerise.app";
const TRUSTED_HOSTS = new Set(["namerise.app", "www.namerise.app"]);
const MAX_BODY_BYTES = 256 * 1024;

export type CheckResult =
  | { ok: true; data: FoundResponse }
  | { ok: false; code: ErrorCode; message: string; httpStatus?: number; retryAfterSeconds?: number };

export type ClientOptions = {
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Retries after the first attempt, for network errors, timeouts and 502/503/504 only. */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const fail = (code: ErrorCode, message: string, extra: Partial<Extract<CheckResult, { ok: false }>> = {}): CheckResult => ({ ok: false, code, message, ...extra });
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function normaliseCertificateId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return CERTIFICATE_ID_RE.test(id) ? id : null;
}

/** A link we got back is only passed on when it points at NameRise over https. */
export function trustedHumanUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && TRUSTED_HOSTS.has(url.hostname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function checkCertificate(rawId: unknown, opts: ClientOptions): Promise<CheckResult> {
  const id = normaliseCertificateId(rawId);
  if (!id) return fail("invalid_certificate_id", "A certificate ID is exactly 64 hexadecimal characters (0-9, a-f).");
  const key = opts.apiKey?.trim();
  if (!key) return fail("missing_credentials", "NAMERISE_API_KEY is not set. Get a key from support@namerise.app and set it in the MCP server environment.");
  if (!API_KEY_RE.test(key)) return fail("invalid_credentials_format", "NAMERISE_API_KEY does not look like a NameRise key (expected nrk_live_ followed by 32 characters).");

  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRetries = Math.min(opts.maxRetries ?? 2, 3);
  const sleep = opts.sleep ?? defaultSleep;
  const url = `${API_ORIGIN}/api/v1/certificates/${id}`;

  let last: CheckResult = fail("network_error", "Could not reach NameRise.");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(300 * 2 ** (attempt - 1));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      // redirect: "manual" so the Authorization header can never be forwarded to another host.
      const res = await doFetch(url, { method: "GET", redirect: "manual", signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "namerise-certificate-check-mcp/0.1.0" } });
      const outcome = await interpret(res);
      if (outcome.ok || !isTransient(outcome)) return outcome;
      last = outcome;
    } catch (e) {
      last = (e as { name?: string })?.name === "AbortError" ? fail("timeout", `NameRise did not answer within ${Math.round(timeoutMs / 1000)} seconds.`) : fail("network_error", "Could not reach NameRise.");
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

const isTransient = (r: CheckResult) => !r.ok && (r.code === "timeout" || r.code === "network_error" || (r.code === "upstream_error" && [502, 503, 504].includes(r.httpStatus ?? 0)));

async function readJson(res: Response): Promise<unknown> {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) throw new Error("too large");
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("too large");
  return JSON.parse(text);
}

async function interpret(res: Response): Promise<CheckResult> {
  const s = res.status;
  if (s >= 300 && s < 400) return fail("unexpected_response", "NameRise answered with a redirect, which this connector does not follow.", { httpStatus: s });
  const retryAfter = Number(res.headers.get("retry-after"));
  let body: unknown;
  try { body = await readJson(res); } catch { body = undefined; }

  if (s === 200) {
    const parsed = FoundResponseSchema.safeParse(body);
    if (!parsed.success) return fail("unexpected_response", "NameRise returned a response that does not match the documented certificate format.", { httpStatus: s });
    return { ok: true, data: { ...parsed.data, human_url: trustedHumanUrl(parsed.data.human_url) } };
  }
  const detail = ErrorBodySchema.safeParse(body);
  const apiMessage = detail.success ? detail.data.error.slice(0, 300) : undefined;
  if (s === 401) return fail("unauthorized", apiMessage ?? "The API key was missing, invalid or revoked.", { httpStatus: s });
  if (s === 403) return fail("forbidden", apiMessage ?? "This API key is not allowed to read certificates.", { httpStatus: s });
  if (s === 404) return fail("not_found", "No certificate with this ID exists.", { httpStatus: s });
  if (s === 429) return fail("rate_limited", apiMessage ?? "Monthly quota reached. Contact support@namerise.app to raise it.", { httpStatus: s, ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}) });
  if (s >= 500) return fail("upstream_error", `NameRise returned a server error (${s}).`, { httpStatus: s });
  return fail("unexpected_response", `NameRise returned an unexpected status (${s}).`, { httpStatus: s });
}
