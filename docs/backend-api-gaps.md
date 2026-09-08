# Backend API gaps for Railway migration and Actions automation

Review date: 2026-09-08. Status: proposed consumer requirements, not implemented
API routes or approved fleet policy.

The SDK covers declaration registration and artifact storage. Replacing
Biohazard's Railway integration requires a deployment control plane, isolated
application storage, and workload authorization. Content-forge can automate
candidate packaging and artifact upload sooner, but hosting its review site
also requires the deployment and browser-access interfaces.

The smallest useful hosted milestone is a protected static content-forge site,
deployed from a verified immutable artifact. That proves the shared lifecycle
before adding Biohazard's Node runtime, persistent world, and disposable previews.

## Evidence boundary

| Repository | Inspected revision and scope |
| --- | --- |
| SDK | `443c591`, main after PR #1; all current public methods |
| Biohazard | `8939d5c8`, fetched main; Railway tools and Actions files have no changes from the local checkout inspected |
| Biohazard SDK migration | `c5f4809b`, consumer branch; not an ancestor of fetched main |
| Content-forge | `8066798`, onboarding branch; not an ancestor of fetched main `1f7120e` |
| hosting-api | `109475c`, matching fetched main; HTTP routes, OIDC policy, declarations, artifact store |
| t1-hosting | `32aae6c`, matching fetched main; gateway and RFC-008; unrelated uncommitted operational work excluded |
| auth | `aaf8051`, matching fetched main; HTTP/OIDC routes and RFC-0002 |

No Railway resources, running applications, auth membership, or gateway routes
were changed. This is a source audit with focused tests, not a live migration
acceptance run. The consumer SDK migrations still need to land before describing
either consumer's main branch as using the shared onboarding operation.

## What Biohazard actually uses

There is no Railway library dependency in Biohazard's package manifest. The
integration is a custom GraphQL adapter plus `@railway/cli@5.44.1` invoked by
tools and Actions. This matches Railway's documented division between its
[GraphQL API](https://docs.railway.com/integrations/api) and
[CLI deployment flow](https://docs.railway.com/cli/deploying).

| Existing consumer operation | Source evidence | Required platform behavior |
| --- | --- | --- |
| Check workspace scope; discover/create project and service | [workspace adapter][bio-workspace]: `apiToken`, `projects`, `projectCreate`, `serviceCreate` | Resolve the caller's project and granted capabilities; provision logical services without consumer-supplied fleet IDs |
| Reuse/create an ephemeral environment; reclaim it | [workspace adapter][bio-workspace]: `environmentCreate`, `environmentDelete`; [cleanup workflow][bio-cleanup] | One isolated preview per repository/PR, concurrency-safe creation, closure/expiry/cap cleanup |
| Mint and revoke an environment-scoped deploy token | [workspace adapter][bio-workspace]: `projectTokenCreate`, `projectTokens`, `projectTokenDelete` | Federation for control-plane calls; bounded workload grants when the application itself must be called |
| Set/read variables without triggering intermediate deploys | [preview workflow][bio-preview]: `variables --set`, `--skip-deploys` | Revisioned nonsecret configuration and secret references applied with the deployment |
| Upload source, build, and identify the resulting deployment | [deployment runner][bio-deploy]: `up`, marker reconciliation, deployment listing | A durable operation/deployment ID bound to verified source and artifact identity; safe retry after a lost acknowledgement |
| Allocate/discover a domain | [preview workflow][bio-preview]: `domain`, `domain list` | Route allocation, TLS readiness, and an access policy; readiness cannot just mean a domain was returned |
| Wait for the exact deployment and inspect failures | [deployment diagnostics][bio-logs]: `deployment`, `buildLogs`, `deploymentLogs`; [verifier][bio-verify] | Separate build, start, readiness, route, and supersession state; scoped logs and bounded polling |
| Verify volume identity, mount, and separation from other environments | [target configuration][bio-targets], [verifier][bio-verify] | Durable storage attachments with isolation, health, quota, and backup/restore contracts |
| Promote an approved commit after confirming canary runs it | [deployment runner][bio-deploy] | Approved promotion of the same verified artifact, with concurrency checks and rollback evidence |
| Seed previews and publish authored world state | [preview seed][bio-seed], [content publication][bio-content], [release-content workflow][bio-release-content] | Authorized application data import, source/destination revisions, validation and recovery records |

The last row is an application API hosted on Railway, not Railway's own API.
Likewise, actor validation, asset provenance, game-page smoke tests, and review
decisions remain consumer responsibilities. GitHub releases, PR comments, and
Discord announcements can continue in Actions using outputs from the SDK.

## What the backend is missing

The current route inventory is [documented separately](backend-contract.md) and
matches [hosting-api's router][hosting-router]. The following operation names
are proposed contract shapes. Do not add them to v1 declarations or advertise
them as working SDK commands.

| Priority | Missing HTTP surface | Minimum reviewable contract | Owner |
| --- | --- | --- | --- |
| First hosted slice | `capabilities` and project grant readback | Supported schemas/operations, runtime kinds, limits, allowed channels/access requests, and explicit holds for unavailable capabilities | hosting-api, backed by fleet/auth policy |
| First hosted slice | Immutable artifact versions and atomic publication | Digest-addressed version, trusted source/run provenance, digest validation before activation, version lookup, retained previous version; conflicting writes cannot replace an accepted artifact | hosting-api/store |
| First hosted slice | Application `plan` and `apply` | Versioned request; expiring plan ID; actor, source, artifact, configuration and policy revisions; named holds; idempotency key; durable operation ID; stale-plan refusal | hosting-api; t1-hosting reconciles placement |
| First hosted slice | Deployment read/list/wait and diagnostics | Desired and observed revisions, exact deployment ID, active artifact digest, route/auth/TLS readiness, timestamps, failure reasons, cursor-based scoped logs | hosting-api and runtime driver |
| First hosted slice | Protected routes and application access | Auth-owned client/group grants; isolated browser origin; private origin transport; login/deny behavior; revocation; no auth-open fallback | auth/provider, t1-hosting; hosting-api coordinates |
| First hosted slice | Promotion and rollback | Promote a known artifact without rebuilding; compare expected current revision; retain compatible route/configuration state; enforce stable authorization server-side | hosting-api and runtime driver |
| Biohazard runtime | Runtime configuration and secret bindings | Stage configuration with deployment; return secret names/revisions, not values; use federation for machine access where possible | hosting-api plus fleet secret/provider integration |
| Biohazard runtime | Storage attachment and recovery | Per-environment volume identity, mount state, quotas, backup/snapshot status and restore operations; explicit ephemeral versus persistent lifetime | hosting-api and fleet storage driver |
| Biohazard previews | Preview ensure/list/destroy and reclamation | Repository/PR ownership; stable preview identity; expiry/cap policy; idempotent deletion; cleanup even after job cancellation; never delete another environment class | hosting-api; backend controller or scoped Actions caller |
| Biohazard content | Content-addressed object transfer and workload authorization | Authenticated `has/get/put` by digest, bounded streaming, read/write scope separation, revisioned manifest refs; short-lived grants for an allowed application operation | hosting-api/object store and application integration |
| Later self-management | Access requests and delegated administration | Membership/access readback, project-scoped request/review operations, revocation and audit; administrator bootstrap remains an external grant | auth/provider through a public project interface |

Existing storage limitations are substantive: [publish][hosting-publish] writes
the mutable artifact name before checking the expected digest, and list/read
records do not return a retained version or digest. Retention is parsed but not
enforced. Client receipt verification detects a mismatch after the write; it
cannot supply atomic activation or recover the overwritten version. The SDK
also buffers a whole artifact, with the current 512 MiB limit. Streaming can be
added in the SDK over today's body interface, but resumability and immutable
versions require server support.

Public application requests should describe a static site or Node/container
runtime, its artifact, health contract, storage needs, and requested access.
Physical host selection stays in fleet policy. Artemis is the requested initial
content-forge placement, not a host field for every consumer to manage.

The [Blockbench dependency review](blockbench-dependency-boundary.md) separates
the producer toolchain from these hosting APIs and recommends a pinned editor
worker plus independently packaged viewer/texture dependencies.

## Actions-specific contracts that cannot live only in YAML

**Bind the operation to the actual build.** Today's backend verifies repository
ID and ref; [its claims model][hosting-identity] does not retain commit SHA,
workflow identity, or run ID/attempt. Registration accepts a caller-supplied
declaration without fetching or attesting the file at its commit. A deploy
record needs verified source and build provenance. For PRs, distinguish the
event's merge ref/SHA from a checked-out head SHA. For `workflow_run` or a release,
distinguish the executing workflow from the artifact-producing run. A supplied
`expectedSha` is an assertion to verify, not authority. GitHub exposes the
[claims needed for this distinction](https://docs.github.com/en/actions/reference/security/oidc).

**Preserve authorization while simplifying calls.** The current
[channel policy][hosting-policy] admits canary from main or the `canary`
Environment, stable from the `production` Environment, and `preview:N` from the
matching PR merge ref. `id-token: write` only enables identity acquisition.
Required reviewers and allowed deployment refs must actually be configured.
Biohazard's `release-content` Environment is not the current backend's stable
Environment name; that migration needs explicit alignment. Custom OIDC subject
templates and environment claims also need compatibility tests against the
deployed verifier, rather than assuming every default GitHub subject shape.

**Give cleanup its own authority.** A scheduled workflow on main is not a token
for every PR. The backend has no delete endpoint, and using its existing preview
write policy for cleanup would reject a main-branch caller. Introduce a scoped
preview-management grant or a backend reclaimer; do not loosen PR deployment
authorization to make cleanup work. Backend expiry must handle a cancelled job
whose `always()` cleanup never completed. Closure decisions need authoritative,
paginated PR state, not a caller's unchecked list of open PRs.

**Separate reads from promotion.** Artifact list/fetch currently use the same
channel authorization as writes. A preview job therefore cannot automatically
read a stable seed artifact. Define explicit seed/read grants scoped to known
versions without allowing stable writes. A browser reviewer also cannot use a
GitHub Actions token; machine federation and human sessions are separate paths.

**Do not expose deployment credentials to replace one CLI.** The current
Railway flow exchanges a workspace credential for a project-token lease and
reads `PROMOTION_SECRET` for the game's import API. Turbo Ogre control-plane
calls can use Actions OIDC directly. Application calls need a scoped, short-lived
workload identity or backend-mediated operation, rather than an API that returns
the application's raw secrets. The current hosting service stores no credentials;
any secret persistence would need an explicit backend design justification.

**Make readiness and retries useful to automation.** Apply should return a
stable operation ID even if activation is pending. Retrying the same authorized
request must recover that operation, while changed bytes under the same key
must fail. A wait operation should fail on terminal build/start errors or a
superseded deployment, distinguish an outage from a denial, and retain the
original failure if log collection also fails. Return JSON plus nonsecret
artifact/deployment/URL outputs suitable for Actions summaries.

## Content-forge: work possible before runtime APIs exist

There is no `.github` workflow tree on the inspected onboarding branch or fetched
main. The branch has the SDK commands, retained `.bbmodel` sources, bounded
cohorts, and deterministic packaging; these are prerequisites, not an installed
automation pipeline.

1. Land the existing consumer work. Add a PR check for tests, local
   `hosting:plan`, and the selected review evidence. Fork PRs can validate
   locally without a backend identity. Candidate hosting must never invoke
   Minecraft content release or record artistic approval.
2. Make the build inputs reproducible. [Sheet generation][forge-sheet] imports
   `esbuild` and Three.js from the configured Blockbench checkout's
   `node_modules`. [Family export][forge-family] needs its automation-enabled
   editor, and `latest.json` contains machine-local output paths. The generated
   packs, sheets, and exports are gitignored. Either pin and provision the
   producer toolchain in a dedicated job, or consume verified export artifacts
   tied to retained-source and exporter hashes. Resolve portable artifact
   paths on the runner instead of transferring a developer's absolute paths.
   The texture generator is also imported from Blockbench source by several
   producers and tests; it needs an explicit package or pinned checkout input.
3. Keep packaging separate from authoring. [The bundler][forge-bundle] needs
   completed sheets/evidence, Node and Python 3. A packaging job can select and
   hash-check those exact inputs without a game or editor process. Pin their
   producing revision/run; never silently reuse whichever export is latest.
4. Add an authorized main/canary artifact job using the existing SDK:
   `hosting:onboard`, then `hosting:publish -- --channel canary`. Configure the
   platform URL/audience and `id-token: write`. Retain both the local bundle
   receipt and server publish receipt. This stores a candidate; it returns no
   hosted-site URL. A later stable job needs the actual `production` Environment
   grant. No backend preview publish is declared for content-forge today.
5. Once immutable artifacts, deployment operations, and browser access exist,
   pass that artifact version to plan/apply and wait for the exact protected
   revision. Verify permitted access, denial, revocation, auth outage, and origin
   bypass before reporting the site hosted.

The current [auth provider][auth-registry] has no general relying-party registry
or project-delegated membership contract. Its existing group storage is usable,
but a group alone does not protect a route. The recorded provider migration and
[fleet onboarding RFC][fleet-onboarding] remain the backend design authority.
Content-forge's shared review write API is separate future application work:
today notes stay in the browser until exported, and hosted read access is enough
for the first milestone.

## Migration order and acceptance

| Slice | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A: portable candidate CI | Land consumer branches, pin producer inputs, package/test/upload through the existing SDK | Fresh runner reproduces the selected source/export evidence; missing or changed inputs fail; no artistic approval or deploy claimed |
| B: protected static hosting | Capabilities, immutable artifact versions, application plan/apply/status, private route and browser group checks, rollback | Content-forge runs through the gateway on the granted placement; interrupted apply reconciles; wrong-group/auth-outage/bypass probes deny; previous verified version restores |
| C: Biohazard runtime | Node/container deployment, versioned configuration, isolated durable storage, exact-revision diagnostics | Canary runs the expected build and world; canary/stable storage stays isolated; approved promotion reuses the verified artifact; rollback has a tested data-compatibility boundary |
| D: Biohazard previews/content | Preview lifecycle and expiry, scoped seeding reads/import authorization, content recovery | Concurrent/retried pushes converge; cancelled/closed/expired previews reclaim safely; seed targets the new deployment; world imports validate and leave recovery evidence |

For slice B, implement backend contracts and test them before adding SDK methods
such as `capabilities`, application plan/apply, deployment wait/logs, and rollback.
Keep the existing `onboard --dry-run` meaning (local declaration preview) explicit;
it must not silently become a server-issued deployment plan. SDK bindings,
polling, output formatting, and an optional reusable Actions workflow then remove
consumer plumbing without copying Railway's administrative API into every app.

Validation performed during this audit:

- hosting-api: `go test -race ./internal/api ./internal/oidc ./internal/publish
  ./internal/tenant` passed; the publish package itself has no standalone tests.
- Biohazard: the preview, target-config, release-automation, and asset-store
  suites reported 138 passes and one failure because
  `.build/sites/public/game/index.html` is absent. No generated game build or
  live deployment was produced for this audit.
- Content-forge: all three hosting-bundle tests passed, including digest
  mismatch preservation and refusal of an escaping symlink.
- SDK: `npm run check` passed all 23 tests, both consumer fixtures, and the
  package install; proposed lifecycle surfaces have no implementation yet.

[bio-workspace]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/railway-workspace-api.mjs
[bio-preview]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/.github/workflows/pr-preview.yml
[bio-cleanup]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/.github/workflows/pr-preview-cleanup.yml
[bio-deploy]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/railway-deploy-runner.cjs
[bio-targets]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/railway-target-config.cjs
[bio-verify]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/railway-verify-runner.cjs
[bio-logs]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/railway-deployment-logs.mjs
[bio-seed]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/preview-seed.mjs
[bio-content]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/tools/content-publish.mjs
[bio-release-content]: https://github.com/slipgatecentral-ops/codex-biohazard-battle/blob/8939d5c8/.github/workflows/release-content.yml
[hosting-router]: https://github.com/jrepp/hosting/blob/109475c/internal/api/server.go
[hosting-publish]: https://github.com/jrepp/hosting/blob/109475c/internal/publish/publish.go
[hosting-identity]: https://github.com/jrepp/hosting/blob/109475c/internal/oidc/validator.go
[hosting-policy]: https://github.com/jrepp/hosting/blob/109475c/internal/oidc/policy.go
[forge-sheet]: https://github.com/jrepp/content-forge/blob/8066798/scripts/review-sheet.mjs
[forge-family]: https://github.com/jrepp/content-forge/blob/8066798/producers/blockbench/item-family.mjs
[forge-bundle]: https://github.com/jrepp/content-forge/blob/8066798/scripts/hosting-bundle.mjs
[auth-registry]: https://github.com/jrepp/auth/blob/aaf8051/RFC-0002-relying-party-registry.md
[fleet-onboarding]: https://github.com/jrepp/t1-hosting/blob/32aae6c/docs-cms/rfcs/rfc-008-turbo-ogre-project-onboarding.md
