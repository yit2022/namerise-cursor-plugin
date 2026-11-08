export const ID = "3f9c".padEnd(64, "a");
export const KEY = "nrk_live_" + "A".repeat(32);
export const found = (over: Record<string, unknown> = {}) => ({
  object: "certificate_check", found: true, id: ID, status: "valid", valid: true,
  subject: { name: "Jane Doe", legal_name: null, role: "Founder", website: "https://janedoe.example/", facts_url: null },
  statement: "Jane Doe is a founder in Nairobi.", not_confused_with: "Jane Doe, the footballer",
  sources: [{ label: "Site", url: "https://janedoe.example/" }], verified_accounts: [{ platform: "LinkedIn", url: "https://linkedin.com/in/janedoe" }],
  issued_at: "2026-11-05T09:00:00.000Z", expires_at: "2027-05-04T09:00:00.000Z", revoked_at: null, recorded_at: "2026-11-05T09:00:01.000Z",
  chain: { ok: true, entries: 12, algorithm: "sha256(prev_hash|seq|at_iso_utc|kind|payload_text)" },
  basis: "Self-declared by the subject. NameRise has not verified government identity documents.",
  human_url: `https://namerise.app/certificate/${ID}`, checked_at: "2026-11-08T10:00:00.000Z", ...over,
});
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
