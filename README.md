# Turbo Ogre SDK

Public client resources for **Turbo Ogre**, the hosting backend currently
developed across the jrepp.com hosting and auth repositories. Projects integrate
through this SDK and HTTP contracts. They own their content and declarations;
the backend owns placement, gateway routing, identity, and access policy.

The first consumer is [content-forge](examples/content-forge/README.md): small
Minecraft content review sheets with retained Blockbench sources.

## Current scope

The initial client targets the existing hosting-api v1 wire contract, verified
against backend revision `109475c`. It supports:

- Local declaration creation and validation, with unknown fields rejected.
- GitHub Actions OIDC identity acquisition and channel authorization checks.
- Registration and inspection of the declaration governing the caller's ref.
- Artifact upload, listing, and download, with upload receipt and download hash
  verification. Backend refusal reason strings remain available to callers.

Artifact publication means **stored bytes**, not a running website. Runtime
deployment, Artemis placement, browser login, project group provisioning,
delegated membership, rollback, and deployment health are backend work still
required. No CLI command claims those operations exist today.

## Use the initial client

Requires Node.js 22 or newer; no runtime dependencies. The npm package is not
published yet (`private: true`). For the initial checkout:

```sh
git clone https://github.com/turbo-ogre/sdk.git
cd sdk
npm run check
node bin/turbo-ogre.mjs init --project my-project
node bin/turbo-ogre.mjs check
```

`init` creates `hosting.json` and refuses to overwrite it. JSON is an accepted
YAML subset on the current backend; this client deliberately accepts JSON
declarations only. The [schema](schema/hosting.schema.json) is a conservative
client subset of v1, not authority to grant access. A project label gives no
rights; repository identity and ref come from the verified token on the server.

For a consumer checkout, install a reviewed commit instead of a moving branch:

```sh
npm install --save-dev @turbo-ogre/sdk@git+https://github.com/turbo-ogre/sdk.git#COMMIT_SHA
npx turbo-ogre check --file hosting.json
```

Supply the backend URL and token audience as deployment environment variables:

```sh
export TURBO_OGRE_URL='https://t1.jrepp.com/hosting'
export TURBO_OGRE_AUDIENCE='https://hosting.jrepp.com'
npx turbo-ogre register --file hosting.json
npx turbo-ogre validate --channel canary
npx turbo-ogre publish --channel canary --artifact review-site.tar.gz --file review-site.tar.gz
npx turbo-ogre status
npx turbo-ogre list --channel canary
```

These are the existing fleet values; the audience is the backend's configured
identifier and need not equal the gateway address. Turbo Ogre branding does not
silently change either. Consumers configure them, never hostnames or ports in
client source. In Actions, grant `permissions: id-token: write`; the SDK mints
the short-lived identity. It writes no credential files. An operator may supply
`TURBO_OGRE_TOKEN` through their environment for a supported backend identity.
An auth portal cookie is not a hosting-api token.

Save the upload receipt. Downloads require its digest:

```sh
npx turbo-ogre fetch --channel canary --artifact review-site.tar.gz \
  --sha256 RECORDED_SHA256 --out downloaded-review-site.tar.gz
```

`fetch` verifies bytes before writing and refuses to overwrite an existing file.
The current backend lists mutable artifact names without content digests. A
download after replacement can therefore fail the saved receipt check; it does
not silently accept a different build. Retention is declared but the current
artifact store does not yet implement version retention or rollback.

## Node API

```js
import {readFile} from 'node:fs/promises';
import {TurboOgreClient, githubActionsToken} from '@turbo-ogre/sdk';

const client = new TurboOgreClient({
  baseUrl: process.env.TURBO_OGRE_URL,
  token: githubActionsToken({audience: process.env.TURBO_OGRE_AUDIENCE}),
});
await client.register(JSON.parse(await readFile('hosting.json', 'utf8')));
const receipt = await client.publish({
  channel: 'canary', artifact: 'review-site.tar.gz',
  bytes: await readFile('review-site.tar.gz'),
});
console.log(receipt.digest);
```

TypeScript declarations are included. This is a Node client; browser sessions
and browser-safe APIs belong to the future human-access interface. Requests use
HTTPS, bounded response sizes, timeouts, and no redirect following. HTTP on
loopback requires an explicit test option. Tokens and backend error bodies are
not echoed. Errors expose `.reason` and `.status`; `sdk_` reasons describe client
failures and server reason strings remain unchanged.

## Ownership and next interface

| Component | Owns |
| --- | --- |
| `turbo-ogre/sdk` | Client APIs, CLI, schemas, examples, compatibility checks |
| Hosting service | Repository identity, intent, artifact storage, future deployment lifecycle |
| Host inventory driver | Placement, capacity, gateway and certificate policy |
| Auth service | Human sessions, membership, scoped application identity |
| Consumer project | Source assets, builds, review decisions, declaration |

The next onboarding interface should support `plan`, `apply`, `status`, and
`rollback`, plus access requests and delegated project membership. A plan must
report missing backend capabilities before changing anything. Project manifests
may request resources and access roles; they must never grant their own
membership, choose another tenant's namespace, or bypass fleet policy.

See the [backend contract](docs/backend-contract.md) and
[content-forge onboarding](examples/content-forge/README.md).
