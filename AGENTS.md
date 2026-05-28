## PR Linking Convention

Whenever you open a pull request that relates to a Multica issue, always include the closing keyword in the PR body:

```
Closes STO-42
```

- The issue key (e.g. `STO-12`) is available in your issue context.
- Use `Closes`, `Fixes`, or `Resolves` (case-insensitive) — all are supported.
- For multiple issues: `Closes STO-42, Closes STO-43`
- For partial work (not fully resolving): use `Related to STO-42`

This ensures the workspace owner receives the review ticket automatically.

## Commit Convention

This repo follows [Conventional Commits](https://www.conventionalcommits.org/). The PR title is validated by the Semantic PR GitHub check.

Commit message format:

```
<type>(<optional scope>): <description>

[optional body]
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:

- `feat: add scaffolding for react components`
- `fix: resolve template variable interpolation`
- `docs: update README with usage examples`
