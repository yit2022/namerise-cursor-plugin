# Publishing checklist (internal; delete or keep private)

## Public repository must contain
`.cursor-plugin/plugin.json`, `mcp.json`, `README.md`, `LICENSE`, `SECURITY.md`, `server/` (src, test, `dist/index.js`, `package.json`, `package-lock.json`, `tsconfig.json`), `examples/`.

## Must stay private (never in this repo)
The NameRise application repository (`yit2022/byline`) and its history, `.env*` files, Cloudflare/Supabase/Paystack/Gemini keys, any real `nrk_live_` key, customer or certificate data, operator tooling.

## Before submitting at https://cursor.com/marketplace/publish
- [ ] Create a public repo (needs your approval) and push this folder as its root.
- [ ] Set `repository` in `.cursor-plugin/plugin.json` to that URL.
- [ ] Add a logo (`logo` field, relative path) if you want one; optional per Cursor docs.
- [ ] Live smoke test with a real key and certificate ID.
- [ ] Install locally in Cursor and confirm the tool appears.
- [ ] Confirm licence choice (MIT proposed).
- [ ] Submit once; the form sends no confirmation and review is manual.
