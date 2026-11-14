# Cloudflare preview: secret persistence and recovery

Scope: **feature/cotego-premium-ux only**. Do not modify the production route or `cotego.fr`.

## Incident evidence (2026-11-13)

GitHub Actions run 43443141739, job `smoke-preview`, returned HTTP 200 with `ok=true` and `footballDataConfigured=false` three times. This proves the public preview endpoint lacked the expected runtime binding **at that moment**; it does not prove the upstream provider key was deleted. Earlier the same endpoint had returned `true` after a secret deployment. Unit and browser tests passed independently.

## Safe diagnosis

1. Open the Cloudflare dashboard for the preview deployment, not Production. Confirm the preview URL is `https://feature-cotego-premium-ux-cotego.salama-jimmy.workers.dev`.
2. In **Settings → Runtime variables and secrets**, verify a **Secret** named exactly `FOOTBALL_DATA_API_KEY`. Do not expose or copy its value into logs, screenshots, repository files, or GitHub Actions.
3. Compare the **Deployments** timeline: note the deployment ID and source for the last `true` response and the first `false` response. A green **Ready** means the deployment succeeded, not that its secret binding exists.
4. Request `/api/status` on the **exact URL above**, before and after the next preview-only code deployment. Record UTC time, HTTP code, `ok`, and `footballDataConfigured` (never the key). Check the corresponding GitHub Actions `smoke-preview` job.
5. If `false` only after code deployment, inspect whether Git integration uses a different environment or overrides runtime bindings. Fix the environment/binding mapping rather than rotating the API key on every release.
6. If `true` but a league fails, inspect the provider response and quota separately; do not diagnose it as a missing secret.

## Prevention

- Keep the secret as a Cloudflare **runtime secret** for the preview environment; `wrangler.jsonc` only declares its required name and **does not provision its value**.
- Never place the secret in `wrangler.jsonc`, source, CI output, or browser bundles.
- Treat the existing `smoke-preview` health check as a deployment gate. A missing binding must fail the preview check; do not mask it by substituting sample football data.
- Preserve a separate preview environment and do not publish a production route as part of this investigation.
- Once the root cause is fixed, prove persistence across **two successive preview-only deployments**. Record both deployment IDs and passing CI runs before declaring the issue resolved.

No paid Cloudflare features are required by this procedure.

## Verified Cloudflare Worker Previews recovery procedure (official Wrangler CLI)

Cloudflare distinguishes **Workers Builds variables** (available to the build process) from **Preview runtime secrets** (available as `env.FOOTBALL_DATA_API_KEY` in requests). A build secret does not automatically provide a runtime binding. Worker Previews are isolated from Production.

Official references:
- https://developers.cloudflare.com/workers/previews/configuration/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

**Only when an operator has authorized Cloudflare access and can enter the existing secret privately**, run these commands from a checked-out repository using the configured Wrangler version. Never paste the secret into chat, a shell command argument, a CI variable, or a tracked file:

```sh
npx wrangler preview secret list --name feature/cotego-premium-ux --worker-name cotego
# If missing, prompt privately for the existing key (do not echo it):
npx wrangler preview secret put FOOTBALL_DATA_API_KEY --name feature/cotego-premium-ux --worker-name cotego
npx wrangler preview secret list --name feature/cotego-premium-ux --worker-name cotego
```

The `secret put` command **creates a new Preview deployment**; it is not a read-only operation. Do not run it without the operator's consent. It must not target Production. Confirm the resulting Preview URL and `/api/status` after this operation. If no authenticated Wrangler session is available, the operator must perform this step through their Cloudflare account; GitHub read/write access alone cannot provision the runtime secret.

**Previews Base is not a retroactive fix:** `npx wrangler preview base-config secret put FOOTBALL_DATA_API_KEY` seeds **newly created** Previews only. Cloudflare explicitly says later Base secret changes do not update existing Previews. Avoid deleting/recreating the existing Preview just to inherit Base settings; this risks unnecessary disruption. Set the existing Preview secret directly first. The `previews` object in `wrangler.jsonc` is for non-secret configuration and cannot hold the secret value.

After setting the secret, verify `footballDataConfigured:true`, deploy a preview-only code change, verify again, and repeat once. If the binding vanishes, capture the exact Wrangler command/version and Preview deployment IDs, then escalate with reproducible evidence. Never claim persistence based on a single successful health check.
