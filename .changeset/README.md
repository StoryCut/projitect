# Changesets

This monorepo uses [changesets](https://github.com/changesets/changesets) for versioning and releases.

All public packages (`projitect` and `@projitect/*`) are in a **fixed** group — they bump
together to a single shared version. This matches Effect v4's own release model. The marketing
site under `apps/website` is in the `ignore` list and never versioned.

## Adding a changeset

```bash
pnpm changeset
```

Pick the packages that changed, pick a bump type (patch / minor / major), write a short
human-readable summary. The CLI writes a Markdown file to this directory. Commit it.

## Releasing

CI runs `changesets/action` on merges to `main`. It either opens a "Version Packages" PR (when
unreleased changesets exist) or publishes to npm with OIDC (when that PR is merged).
