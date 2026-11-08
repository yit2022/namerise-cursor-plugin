import { z } from "zod";

/** A NameRise certificate ID is the 64-character lowercase hex SHA-256 hash of its ledger entry. */
export const CERTIFICATE_ID_RE = /^[0-9a-f]{64}$/;
/** API keys look like nrk_live_ followed by 32 URL-safe characters (see lib/api-clients/keys.ts in the app). */
export const API_KEY_RE = /^nrk_live_[A-Za-z0-9_-]{32}$/;

const nullableString = z.string().nullable();

/**
 * Shape of GET /api/v1/certificates/{id} when found:true. It mirrors the route handler in the
 * NameRise app (apps/web/app/api/v1/certificates/[id]/route.ts) and the public /developers page.
 * Unknown extra fields are ignored; every field the connector returns is validated.
 */
export const FoundResponseSchema = z.object({
  object: z.literal("certificate_check"),
  found: z.literal(true),
  id: z.string().regex(CERTIFICATE_ID_RE),
  status: z.enum(["valid", "expired", "revoked", "tampered"]),
  valid: z.boolean(),
  subject: z.object({
    name: z.string(),
    legal_name: nullableString.optional(),
    role: nullableString.optional(),
    website: nullableString.optional(),
    facts_url: nullableString.optional(),
  }),
  statement: z.string(),
  not_confused_with: nullableString.optional(),
  sources: z.array(z.object({ label: z.string(), url: z.string() })),
  verified_accounts: z.array(z.object({ platform: z.string(), url: z.string() })),
  issued_at: z.string(),
  expires_at: z.string(),
  revoked_at: nullableString.optional(),
  recorded_at: z.string(),
  chain: z.object({ ok: z.boolean(), entries: z.number(), algorithm: z.string() }),
  basis: z.string(),
  human_url: z.string().optional(),
  checked_at: z.string(),
});
export type FoundResponse = z.infer<typeof FoundResponseSchema>;

export const ErrorBodySchema = z.object({ error: z.string() }).passthrough();

export const ErrorCodes = [
  "invalid_certificate_id",
  "missing_credentials",
  "invalid_credentials_format",
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "timeout",
  "network_error",
  "upstream_error",
  "unexpected_response",
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];
