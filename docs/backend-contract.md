# Backend compatibility and onboarding boundary

See the [Railway and Actions gap review](backend-api-gaps.md) for the concrete
consumer operations, missing backend surfaces, and proposed migration order.

Inspected 2026-09-08 against `jrepp/hosting` revision `109475c` and the live
jrepp.com gateway. The source supports registration and artifact operations;
the backend README's phase-one-only status is stale. No backend imports are
needed by this SDK.

| Client method | HTTP route, relative to configured base | Result |
| --- | --- | --- |
| `validate` | `POST /v1/validate` | Identity/channel decision; denial has a reason |
| `register` | `POST /v1/config` | Declaration stored under token repository ID and ref |
| `status` | `GET /v1/config` | That ref's registered declaration |
| `publish` | `POST /v1/publish?channel=C&artifact=N` | Stored artifact receipt |
| `list` | `GET /v1/artifacts/C` | Current artifact names and metadata |
| `fetchArtifact` | `GET /v1/artifacts/C/N` | Bytes, checked against a caller-supplied digest |

The gateway prefix is retained on every request. Config bodies are JSON sent
as `application/yaml`, which the existing Go YAML parser accepts. Publishes use
`application/octet-stream` and `X-Artifact-Digest` with lowercase SHA-256.
The 512 MiB artifact limit matches the backend; the client buffers one artifact.
Large streaming uploads and resumability are future work.

`canary` currently requires a main-branch or canary-environment identity;
`stable` requires the production environment. The protected GitHub Environment
itself must have required reviewers configured by its owner: an environment
claim alone does not establish that repository setting. Preview subject policy
and fork permissions remain backend decisions. This SDK does not manufacture a
subject or elevate a failed identity.

Known limits requiring backend work:

- No runtime deployment, placement discovery, group management, or application
  status endpoint. `status` here is declaration status only.
- Declarations are submitted under a verified repository/ref identity; current
  registration does not fetch the manifest from GitHub to attest its commit.
- Retention is parsed but not applied. Artifacts currently address mutable names.
- The store performs its write before checking a stated upload digest. The SDK
  hashes an owned copy and verifies the receipt, but cannot make that server
  operation atomic or supply rollback.
- No public human-access gateway contract is implemented. Auth's browser cookie
  is host-only and its two downstream OIDC client slots are already allocated.
  A new third client/group registry was deferred to Authentik by auth RFC-0002.

Content-forge's requested `content-forge` group, isolated browser origin, and
Artemis placement therefore belong in a fleet onboarding plan. Do not work around
the missing contract by sharing auth cookies across domains, serving tenant
JavaScript on the auth origin, or giving consumers SSH/nginx/auth-database access.

The proposed next protocol separates a project-owned request from a fleet-owned
grant. Numeric repository ID binds the tenant. The planner returns named holds
for unavailable placement, auth provider, group delegation, or certificate
coverage. Applying a plan must revalidate its revision and actor, reconcile
idempotently, and retain rollback evidence. Neither a declaration edit nor a
passed content review automatically grants membership or publishes a website.
