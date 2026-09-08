# Turbo Ogre SDK

This public repository owns client libraries, command-line tools, schemas, and
consumer examples. Keep backend internals and environment placement out of the
client. Deployment inventory and gateway policy belong to t1-hosting; identity
and membership authority belong to auth; hosting-api owns provisioning.

- No project-specific branches in library or CLI code. Use examples for consumers.
- Preserve backend refusal reason strings. Distinguish denial from unavailable
  services; never treat artifact storage as a completed web deployment.
- Never store or log tokens. Resolve repository identity and ref on the server.
- Unknown declaration fields fail locally; the server remains authoritative.
- Keep the initial Node client dependency-free, with matching TypeScript types.
- Run `npm run check` before committing; it includes both consumer examples and
  a packed-package install. Run `npm run lint:workflows` for workflow changes.
  See `CONTRIBUTING.md` for explicit hook installation and staged-file checks.
- Keep unreleased client scaffolding private to npm until a release is prepared.
