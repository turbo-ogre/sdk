# Contributing to the Turbo Ogre SDK

Use Node.js 22 or newer, npm, and Git. CI exercises Node 22 and 24 on Linux;
the local hooks also run on macOS. The SDK has no npm dependencies.
Start from a checkout with:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run hooks:install
npm run check
```

Hook installation is an explicit checkout operation. Installing the SDK as a
consumer dependency does not configure Git. The installer preserves a custom
`core.hooksPath` or existing executable hooks; if you use a hook manager, invoke
`.githooks/pre-commit` from its pre-commit step at the repository root instead.
The relative hooks path also works in linked worktrees containing these files.

## Local checks

`npm run check` checks JavaScript syntax, runs the unit and Git-hook integration
tests, exercises both consumers against local HTTP fixtures, and installs the
actual npm tarball in an isolated consumer. The package check exercises the
public import and installed CLI against both consumer declarations and confirms
the type entry is included. It does not compile a TypeScript consumer.
Checks need no backend, credentials, dependency installation, or external network.

Use `npm test`, `npm run demo`, or `npm run check:package` for a focused iteration.
Temporary repositories, package installs, and test fixtures are cleaned up after
the checks. No checks publish packages, register projects, or deploy services.

Pre-commit first checks staged whitespace, then exports the index to a temporary
directory and runs `npm run check` for changes to source, tests, scripts, hooks,
schemas, examples, or package metadata. Changes to workflows or their lint
script additionally run `npm run lint:workflows`. Documentation-only commits need
just the whitespace check. Partially staged edits are checked as they will be committed; unstaged
and untracked work stays in place. A failed check blocks the commit without
stashing or rewriting files. Restage a fix before retrying.

Workflow editing requires [actionlint](https://github.com/rhysd/actionlint),
version 1.7.12 in CI. Install the same version with Go:

```sh
go install github.com/rhysd/actionlint/cmd/actionlint@v1.7.12
# Ensure your Go bin directory is on PATH, then:
npm run lint:workflows
```

On macOS, `brew install actionlint` is also convenient. The command checks
workflow syntax, expressions, action inputs, and runner configuration. Optional
ShellCheck/Pyflakes integration is disabled consistently in local and CI runs.
If actionlint is missing, a workflow commit fails with installation guidance;
the hook never downloads tools automatically.

## Pull requests

Use a topic branch and open a PR against `main`. The same Node checks run on
every PR and after a merge to `main`; topic-branch pushes do not create duplicate
runs. Manual runs are available through Actions. A new run cancels obsolete
runs for that PR or ref. The Node matrix keeps both versions running if one
fails, and each job has a ten-minute timeout.

Review all three checks: `node (22)`, `node (24)`, and `workflows`. Actions use
read-only repository permissions and SHA-pinned actions, and do not retain Git
credentials. Fork PRs need no secrets. Repository administrators can require
these check names in a ruleset; local hooks are optional and are not an access
control boundary.

Include the behavior changed and validation in the PR description. Preserve
the backend's refusal reasons and keep environment placement and access policy
out of client code. Keep the package `private: true` until a release is prepared.
