# Content-forge onboarding

Content-forge is the first consumer of the Turbo Ogre SDK. Its initial artifact
is a static set of small model/texture review sheets with embedded rendering code
and downloadable retained Blockbench sources. The website hosts review candidates;
publishing it must not approve or promote those assets into Minosoft.

The [hosting declaration](hosting.json) works with the current artifact API.
Check it from this checkout:

```sh
node bin/turbo-ogre.mjs check --file examples/content-forge/hosting.json
```

In the content-forge checkout, generate the selected review sheets, then run
`npm run hosting:bundle` to package only the explicitly listed sheets and their
evidence. Install a reviewed SDK commit, register `hosting.json`, and publish
`work/hosting/review-site.tar.gz` using the commands in the main README. The
consumer keeps its own declaration; this directory is the onboarding example.

The hosting artifact is a candidate review site, not a game-content release.
Each sheet's decisions remain local until the reviewer exports notes. Persistent
shared review decisions will require a separate authenticated write API and
conflict/revision handling; this initial static artifact does not provide one.

## Requested deployment

| Requirement | Fleet responsibility |
| --- | --- |
| Browser origin | `https://content-forge.jrepp.com`, isolated from auth and other tenants |
| Placement | Artemis, supervised service or static-site runtime outside CI runner accounts |
| Permission | Exact `content-forge` group membership before serving any sheet or source |
| Transport | Private gateway-to-Artemis route; no bypass through an exposed origin port |
| Publishing | Project-scoped Actions identity and a recorded artifact digest |
| Recovery | Previous verified artifact and route revision; no auth-open fallback |

These are onboarding requirements, not supported v1 declaration fields. Do not
add them to `hosting.json`: the backend correctly refuses unknown fields today.
Placement, group provisioning, gateway auth, DNS/TLS, and live allow/deny probes
must be complete before declaring the site hosted.
