# Content-forge's Blockbench dependency boundary

Review date: 2026-09-08. Recommendation for the
[Actions and backend migration](backend-api-gaps.md); no dependency migration
is implemented by this review.

Content-forge is the team content workspace: it manages assets, generation,
source-to-build provenance, reviews and modpack builds. It launches Blockbench
as an instance editor, automation host and tooling surface for the selected
asset or family. Manage a pinned hosted editor build and integration extension
for that workflow, with the same tool identity available to automated jobs.
Maintain one implementation of the model codecs and editor semantics in
Blockbench. Packaging and review tools can remain independently installable.

The consumer's [workspace architecture](https://github.com/jrepp/content-forge/blob/4ded0e8/docs/workspace-architecture.md)
is the product design: session launch, source saves, concurrent edits,
generation, team review and reproducible packs. This document describes the
dependency boundary that supports it.

## How deep the current dependency is

Content-forge does not declare Blockbench as a package dependency or vendor it
as a tracked child tree. `producerRoot` resolves a sibling checkout from local
configuration or `BLOCKBENCH_ROOT`. There are four different kinds of coupling:

| Area | Current dependency | Appropriate boundary |
| --- | --- | --- |
| Review sheets | `scripts/review-sheet.mjs` imports esbuild, Three.js, its package metadata and license from the sibling's `node_modules` | Declare and pin these directly in content-forge; the studio viewer already belongs to content-forge |
| Texture generation/classification | `producers/lib/texture-core.mjs`, `scripts/texture-sheet.mjs`, and the split-review acceptance script import `js/automation/texture_gen.js` by filesystem path | Package the portable generator once, with its provenance and tests, for both applications to consume |
| Retained item families | `producers/blockbench/item-family.mjs` sends protocol-v1 load/observe/mutate/export operations into a running Blockbench renderer over CDP | A small client adapter plus a managed, isolated editor worker |
| Older tree conversion and thumbnails | Tree/render scripts evaluate code using `Preview`, `Outliner`, `Cube`, `Canvas`, and related editor globals | Move the needed operations behind the Blockbench automation host, preserving selection/visibility/project state |

The texture generator has no runtime imports or DOM dependencies and returns
RGBA pixel buffers. It is a good extraction candidate. The wrapper also adds
content-forge's shadow-mask behavior; a shared package need not absorb all
consumer-specific policy. Several existing content-forge tests import this core,
so even a complete unit-test run currently needs more than `npm ci` in a fresh
content-forge checkout.

Model export is substantially deeper. The current host invokes the active
Blockbench `Codecs`, `Group`, `Cube`, `Project`, and `Texture` implementations.
Group export temporarily selects exportable elements and restores their flags.
Import, format handling, UVs, display transforms, and PNG extraction depend on
the editor's actual model state. The portable automation sidecar is a protocol
and policy engine; extracting it does not extract a standalone model compiler.
Blockbench's [codec reference](https://web.blockbench.net/docs/classes/custom_codec.Codec.html)
also describes codecs as handling project loading, parsing, and compilation.

The newer item-family driver uses bounded commands and expected revisions, but
still reads `Project`, enumerates `Texture.all`, reads `Blockbench.version`, and
calls the owned project's `close(true)` directly. Its CDP helper picks the first
page target. The adapter is therefore not yet a transport-independent client.
Explicit worker/window identity, project closure, texture inventory and exporter
build identity belong in the supported automation boundary.

## Vendoring versus standalone support

| Choice | Assessment |
| --- | --- |
| Copy the entire editor into content-forge's source tree | Adds update/build ownership without reducing renderer coupling. Avoid making this the permanent integration. |
| Pin the automation-enabled Blockbench fork as a tool dependency | Recommended. Serve a versioned web editor with the integration extension; provision the same toolchain for export jobs. A pinned submodule/checkout is a workable bootstrap. |
| Build a separate content-forge model compiler | Would duplicate codec, project-format, texture and transform behavior. Defer unless a measured deployment constraint justifies a deliberately limited compiler with export-parity fixtures. |
| Independently package the viewer and portable texture core | Recommended now. These already have useful boundaries and do not need an editor process. |

If "vend Blockbench" means downloading and managing a known build behind
`items:export`, that is the recommended direction. Record the tool's content
digest and fork revision, not just the upstream version string: different fork
builds can both report `5.1.6`. Content-forge currently includes the reported
Blockbench version and its own driver digest in export identity, which does not
fully identify changes inside the editor's codec implementation.

Keep `.bbmodel` as the editable source and exported Minecraft models/textures as
the consumption format. A review page should consume the bounded export and
retain the source download. It should not need its own general `.bbmodel`
interpreter. Blockbench documents that its
[project format can change](https://blockbench.net/wiki/docs/bbmodel/).

## Hosted workspace integration

Blockbench's web build and [launch parameters](https://blockbench.net/wiki/docs/url-parameters/)
already support opening content and prompting for plugins. A content-forge
extension can supply the workspace context and save/export actions. The missing
contract is the complete revision-bound editing session, not the web editor.

Start with **Edit in Blockbench** from a family page, opening a dedicated editor
tab. Bind it to an exact source revision, save a new revision back to the
workspace, export a candidate, and return to its review sheet. An embedded panel
can use the same bridge after browser interaction and origin policies are
validated. The browser executes the interactive editor; automated exports
require a separate browser/editor worker.

The proposed bridge needs authenticated launch/attach, method and tool-build
discovery, source/dependency load, acknowledged saves with expected revisions,
export receipts, and detach/recovery. Two authors saving from one base must not
silently overwrite each other. Keep the editor's Undo and local recovery state
separate from durable workspace saves. Return hashes and source revision links
with exports, so opening a review can lead back to the exact editable source.

## Supporting dependency work

1. Give content-forge direct, locked esbuild/Three.js dependencies. Prove that
   a review sheet and bundle can be produced with `BLOCKBENCH_ROOT` absent
   when their export inputs are present.
2. Extract the existing generator into one shared package, preserving its
   notices and deterministic-output tests. Migrate both callers to that package;
   do not create independent copies of the recipes.
3. Pin a Blockbench tool build and launch one worker with an isolated profile
   for each export job. Initially this can be Electron under a controlled
   display; the current code is not evidence of a plain-Node headless exporter.
4. Replace the remaining direct-global operations with project-bound automation
   commands and a small adapter. Verify protocol methods and exact tool identity
   before mutation; preserve retained sources and cleanup only owned projects.
5. Hand off source hashes, tool/build hashes, output hashes and diagnostics as an
   immutable export artifact. Packaging and hosting consume that artifact.

For GitHub Actions, this produces two useful job types: an editor export job
with the pinned tool, and an ordinary Node/Python packaging job. Static review
pages need neither the editor nor the texture generator; the full workspace
launches the editor when an author chooses to edit. Minosoft remains
the final rendering/behavior validation boundary; a successful Blockbench export
or studio screenshot does not establish Minecraft-quality acceptance.

These dependency extractions support the product architecture. They should not
delay the first hosted edit/save/export/review round trip; use pinned tool
inputs while proving that integration.

## Relationship to Turbo Ogre

The public Turbo Ogre SDK should transfer artifacts, request deployments, wait
for readiness, and handle project access. It does not need `add_cube`, UV, or
Blockbench project methods. Those belong to the producer's client adapter.
The content-forge application owns source revisions, edit sessions, generation
recipes, reviews and pack definitions. Its backend uses platform identity,
storage and runtime services through public interfaces. Existing Actions
runners can execute the export tool; a future hosted export
service would additionally need bounded job submission/status/cancellation,
tool-image identity, scoped artifact access, and result/log retention.

The fork currently mounts an opt-in **in-process** `AutomationRuntime` and
content-forge reaches it through local CDP evaluation. A socket implementation
exists in the sidecar, but the editor does not expose an authenticated production
automation service. Provisioning the tool in CI and exposing it remotely are
separate capabilities. The static review delivery slice can precede the complete
workspace integration, but does not replace the hosted editor product goal.

## Source snapshot

Inspected content-forge `8066798` and Blockbench fork `92fe9bb`. The latter has
staged texture-generator/test edits; they were read as local context and left
untouched. A tool release must explicitly identify the committed code it ships.

- [Content-forge configuration](https://github.com/jrepp/content-forge/blob/8066798/scripts/config.mjs)
- [Review builder](https://github.com/jrepp/content-forge/blob/8066798/scripts/review-sheet.mjs)
- [Texture-core import](https://github.com/jrepp/content-forge/blob/8066798/producers/lib/texture-core.mjs)
- [Item-family driver](https://github.com/jrepp/content-forge/blob/8066798/producers/blockbench/item-family.mjs)
- [CDP helper](https://github.com/jrepp/content-forge/blob/8066798/producers/blockbench/cdp.mjs)
- [Thumbnail driver](https://github.com/jrepp/content-forge/blob/8066798/producers/blockbench/render-tree.mjs)
- [Portable texture core](https://github.com/jrepp/blockbench/blob/92fe9bb/js/automation/texture_gen.js)
- [Automation host/export implementation](https://github.com/jrepp/blockbench/blob/92fe9bb/js/automation-host/mount.js)
- [Host contract](https://github.com/jrepp/blockbench/blob/92fe9bb/js/automation/host_contract.js)

Documentation drift found: the architecture document's introduction says the
runtime is not mounted in the renderer, while `js/main.ts` calls
`installAutomation()` and the automation guide describes the opt-in mount.
The source and the latter guide are the basis for the assessment above.
