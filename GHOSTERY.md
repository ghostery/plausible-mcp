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

We run the **BYOK `/mcp` endpoint only** — no Cloudflare Access, no shared key, no OAuth.
Each team member points their MCP client at the Worker and passes their **own** Plausible
API key via `Authorization: Bearer`. Access control is that key: only people with Plausible
access to the site can query.

Deploy the Cloudflare Worker from the `ghostery` branch (`pnpm deploy` is overridden here to a
plain `wrangler deploy` — upstream's script uploads sourcemaps to *Sentry's* Sentry org, which
we neither have access to nor need):

```bash
npx wrangler login          # once, against Ghostery's Cloudflare account
pnpm install
pnpm deploy                 # = npx wrangler deploy
```

First deploy lands on `plausible-mcp.<account>.workers.dev`. That URL is all the team needs.
To front it with `plausible-mcp.ghostery.com` instead, put the zone on Cloudflare and uncomment
the `routes` block in `wrangler.toml`.

No secrets are required for `/mcp`. `PLAUSIBLE_DEFAULT_SITE_ID` in `wrangler.toml` defaults every
query to the `ghostery.com` Plausible site so callers can omit `site_id`.

### Deploy on push (CI/CD)

`.github/workflows/deploy.yml` runs typecheck + build + test and then `wrangler deploy` on every
push to `ghostery` (and via manual **Run workflow**). It's gated on two repository secrets — until
they're set, the deploy step skips with a warning and the run stays green:

```bash
# Create a Cloudflare API token with the "Edit Cloudflare Workers" template, then:
gh secret set CLOUDFLARE_API_TOKEN   --repo ghostery/plausible-mcp   # paste the token
gh secret set CLOUDFLARE_ACCOUNT_ID  --repo ghostery/plausible-mcp   # from `wrangler whoami`
```

After that, merging to `ghostery` deploys automatically. Local `pnpm deploy` still works for
out-of-band deploys.

### Connecting a client (per team member)

Each person gets their own [Plausible API key](https://plausible.io/docs/stats-api) and runs:

```bash
claude mcp add --transport http plausible https://<worker-host>/mcp \
  --header "Authorization: Bearer <their-plausible-api-key>"
```

Cursor and MCP Inspector work the same way (HTTP transport + Bearer header).

### /internal (SSO connector) — not deployed

`/internal` (Cloudflare Access Managed OAuth, shared key, for Claude.ai/Cowork connectors) is
left dormant. It fails closed until its `[vars]` are filled in and two Access apps front the
host. Enable it only if the team needs the managed-connector path — see the upstream
[README](./README.md) "Setting up the `/internal` endpoint" for the full two-app setup.

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
