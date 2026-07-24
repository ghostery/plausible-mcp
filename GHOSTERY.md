# Ghostery fork

This is Ghostery's deployment fork of [`getsentry/plausible-mcp`](https://github.com/getsentry/plausible-mcp).
We run it against Ghostery's Plausible account to query traffic and conversion data for
[`www.ghostery.com`](https://github.com/ghostery/www.ghostery.com).

Upstream is the source of truth for the MCP itself. This fork exists to **deploy** it under
Ghostery's own domain and Cloudflare Access, and to stage patches we intend to send back
upstream (see [Custom properties](#custom-properties)).

## Branch model

| Branch | Role | Rule |
|--------|------|------|
| `main` | Pristine mirror of `upstream/main`. | Never commit Ghostery-only changes here. Only fast-forwards from upstream land. |
| `ghostery` | **Default & deploy branch.** | Carries Ghostery-only bits: deployment config, this doc, and any patch not yet accepted upstream. Merges `main` regularly. |

We deploy from `ghostery`. We contribute from branches off `main`.

## One-time setup (per clone)

```bash
git remote add upstream https://github.com/getsentry/plausible-mcp.git
git fetch upstream
```

`origin` is `ghostery/plausible-mcp`; `upstream` is `getsentry/plausible-mcp`.

## Pulling upstream changes

Keep `main` a clean mirror, then merge it into `ghostery`:

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main   # main must never diverge — this should always fast-forward
git push origin main

git checkout ghostery
git merge main                       # resolve conflicts in Ghostery-only files (e.g. wrangler.toml)
git push origin ghostery
```

The only recurring conflict is `wrangler.toml` (our deploy config overrides upstream's Sentry values).
Resolve by keeping Ghostery's `routes` / `[vars]`, taking upstream everywhere else.

## Sending a patch upstream

Anything that improves the MCP for everyone (bug fixes, new tools, **custom-property support**)
goes to upstream first — it does not belong only on `ghostery`.

```bash
git checkout main
git checkout -b feat/my-change       # branch off the upstream mirror, not off ghostery
# ... commit ...
git push origin feat/my-change
gh pr create --repo getsentry/plausible-mcp --base main
```

Once merged upstream, it reaches `ghostery` through the normal [pull-upstream](#pulling-upstream-changes) flow.
If we need it in production before upstream merges, cherry-pick it onto `ghostery` temporarily and drop the
cherry-pick when the upstream merge arrives.

## Deployment

Deploy the Cloudflare Worker from the `ghostery` branch:

```bash
pnpm install
pnpm deploy   # wrangler deploy + Sentry sourcemap upload
```

### Ghostery deployment config

`wrangler.toml` on this branch is set to Ghostery values. Items marked `TODO(ghostery)` still
need real values before the first `/internal` (managed-connector) deploy:

- `routes` — the custom domain fronting the Worker (`plausible-mcp.ghostery.com`, TBD).
- `ALLOWED_EMAIL_DOMAIN` — `ghostery.com` (email-domain gate for `/internal`, enforced in code).
- `CF_ACCESS_TEAM_DOMAIN` — Ghostery's Cloudflare Access team domain (`https://<team>.cloudflareaccess.com`).
- `CF_ACCESS_AUD` — the Application Audience tag of Ghostery's `/internal` Access app.

Secrets (set out-of-band, never committed):

```bash
wrangler secret put PLAUSIBLE_API_KEY   # Ghostery's shared Plausible key (used by /internal)
wrangler secret put SENTRY_DSN          # optional — the Worker's own telemetry; unset = disabled
```

The BYOK `/mcp` endpoint needs no shared key — each caller passes their own Plausible key via
`Authorization: Bearer`. See the upstream [README](./README.md) "Setting up the `/internal` endpoint"
for the full Cloudflare Access two-app setup.

## Custom properties

The reason this fork exists: `www.ghostery.com` sends Plausible **custom event properties** that the
upstream MCP tools don't yet expose as dimensions or filters. Currently emitted (see
`app/services/plausible.rb` in the site repo):

- `ctry` — visitor country
- `destination_url`, `destination_host` — outbound link-redirect target
- `position` — link position on the source page
- `source_page` — page the redirect originated from

In the Stats API v2 these are queried as `event:props:<name>` (e.g. `event:props:destination_host`)
as dimensions in `get_breakdown` and as filter operands. Adding that support is **upstream-bound work**:
branch off `main`, PR to `getsentry/plausible-mcp`, then pull into `ghostery`.
