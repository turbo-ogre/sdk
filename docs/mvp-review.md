# Onboarding MVP review

The review target is one onboarding operation shared by two different consumers.
Content-forge has bounded review-site artifacts; Biohazard has game/world
artifacts and a wildcard preview channel. Neither needs backend imports or a
custom identity/HTTP script.

## Try it locally

```sh
npm ci --ignore-scripts
npm run check
npm run demo
node bin/turbo-ogre.mjs onboard --file examples/content-forge/hosting.json --dry-run
node bin/turbo-ogre.mjs onboard --file examples/biohazard/hosting.json --dry-run
```

The demo starts ephemeral loopback HTTP fixtures, runs the real client, checks
registration and a wrong-ref refusal for each consumer, then closes the servers.
It writes no state to a real backend and needs no secrets. It does not validate
GitHub signatures, protected environments, or live auth.

## Reviewable behavior

| Case | Expected result |
| --- | --- |
| Local request preview | Stable declaration digest and channels; no network |
| Register under expected repository ID/ref | Registration and readback both verified |
| Backend returns main for a PR | `sdk_registration_identity_mismatch` |
| Backend returns another repository or numeric ID | `sdk_registration_identity_mismatch` |
| Readback widens artifacts or changes the request | `sdk_registration_declaration_mismatch` |
| Missing expected identity | `sdk_expected_identity_required` before mutation |
| Missing provider or rejected identity | Existing precise backend/client reason |
| Successful registration | `deployment: not-requested` |

Omitted retention and explicit zero compare equally because the Go backend omits
zero when it re-encodes the declaration. Artifact order and channel key order do
not change the local digest. The digest is a client request fingerprint, not a
server-issued plan or an artifact hash.

The SDK validates the receipt after the server's write. A rejected receipt may
mean the registration happened but could not be verified; there is no automatic
undo or retry. Inspect backend state before deciding how to proceed.

## Ergonomics to iterate

- Whether `onboard --dry-run` is clear enough as a local request preview.
- Whether default JSON output is useful for operators or needs a concise human
  view, while retaining machine-readable output.
- Whether hosted environment configuration should be installed as a named
  profile. The initial client keeps URL/audience external and stores no tokens.
- Whether the low-level `register` command should remain prominent. It remains
  compatible, but `onboard` now carries the safe registration/readback workflow.
- JSON-only declarations versus preserving YAML comments. This MVP uses the
  existing JSON subset accepted by the backend, with no new parser dependency.

## Scope boundary

This implements the client side of declaration onboarding. Application planning,
runtime apply/status/rollback, delegated membership, and browser gateway checks
remain backend capabilities. The client must not invent endpoints or successful
deployment states to make the demo appear complete. Real Actions registration
and readback should be exercised from each consumer's review branch separately.
