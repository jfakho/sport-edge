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

## Confirmed configuration evidence — 2026-11-15

The user's dashboard recording shows the existing `feature/cotego-premium-ux` Preview selected:
- **Runtime variables and secrets:** empty.
- **Builds > Variables and secrets:** encrypted football API secret present.
- **Preview command:** `npx wrangler preview`.
- Tracking branch: `feature/cotego-premium-ux`.

This establishes a build/runtime configuration mismatch at the time of the recording. It does not establish that GitHub deleted a secret or explain every earlier incident.

After the user added the existing key to **Runtime variables and secrets**, the public endpoint returned:
- HTTP 200, `footballDataConfigured: true`.
- Deployment ID: `34612306-00b8-468f-b22c-08ba12417f3c`.

This is the baseline for two sequential Git-triggered Preview deployment checks. A successful baseline alone is not evidence of persistence.

### Operating access

The user authorizes management of COTEGO Preview, with no charges without permission. GitHub access is available, but the agent's Cloudflare dashboard login was rejected with HTTP 403. No authenticated Cloudflare CLI/API access has been established. Do not claim automatic secret repair until a supported authenticated management path has been verified. Public health checks and GitHub access cannot read or restore the secret.

Do not ask the user to repeatedly re-enter a key before comparing deployment IDs and configuration scope. Keep the existing Build secret in place during diagnosis; use the Runtime section for the existing Preview.

## Reproduction and durable fix — 2026-11-15

The first Git-triggered redeploy after the runtime key was added reproduced the failure:
- Before: deployment `34612306-00b8-468f-b22c-08ba12417f3c`, configured `true`; Ligue 1 returned HTTP 200 with 306 matches.
- After: deployment `1cf32d5f-101c-42ee-b42b-31ec8e4fcab1`, configured `false`.
- Trigger commit: `95521c0907fa931a411d54f76559e27c9f14fd06`.
This disproves the earlier working assumption that re-entering the key in Runtime alone would solve persistence.

Cloudflare issue https://github.com/cloudflare/workers-sdk/issues/15942 describes this same defect. The official fix https://github.com/cloudflare/workers-sdk/pull/16102 is released in Wrangler **4.149.0** (see its CHANGELOG). COTEGO previously pinned **4.135.0**.

The project now pins 4.149.0 and runs `src/ensure-preview-secret.mjs` as a custom build:
1. It only acts under Workers Builds (`WORKERS_CI=1`) for the exact `feature/cotego-premium-ux` branch.
2. It lists secret names on that Preview. Existing runtime values remain unchanged.
3. If the football runtime binding is absent, it restores it using the already-configured Cloudflare Build secret via private stdin to `wrangler preview secret bulk`. No value is printed, passed as a command argument, or written to disk.
4. It verifies the binding before proceeding. Missing credentials, missing build value, and unconfirmed restoration stop the build.
5. The fixed outer `wrangler preview` then inherits the restored binding.

This uses the existing Cloudflare build authorization, without creating an API token or requesting another key entry. It is limited to the named Preview; production, local builds and other branches are skipped. The Cloudflare Preview command remains `npx wrangler preview`.

End-to-end persistence must still be checked on two deployments using distinct deployment IDs after the upgrade.
