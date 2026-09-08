# Biohazard migration slice

Biohazard already registers an artifact declaration from Actions. The SDK
replaces the workflow's token minting, curl calls, Python comparison, and ref
checks with `turbo-ogre onboard`. Its existing artifact names, retention requests,
and preview wildcard are preserved in [hosting.json](hosting.json).

From this SDK checkout:

```sh
node bin/turbo-ogre.mjs onboard --file examples/biohazard/hosting.json --dry-run
npm run demo
```

The consumer uses the same commands as content-forge:

```sh
npm run hosting:plan
npm run hosting:onboard
```

`hosting:plan` is local and needs no identity. `hosting:onboard` runs in Actions,
with the configured backend URL/audience and GitHub's repository, numeric ID,
and ref environment. It registers and checks readback against all three values
and the intended declaration. The server still owns authorization; client
expectations detect incorrect results and never widen permissions.

This slice does not migrate the game's Railway runtime, art store, world
publication, previews, or browser auth. Those need the backend lifecycle and
access interfaces. A successful registration is not evidence those capabilities
have moved. The consumer's runtime deploy workflow remains the rollback path
while the SDK ergonomics are reviewed.
