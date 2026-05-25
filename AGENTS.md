# projitect — agent guide

`CLAUDE.md` is a symlink to this file. Source of truth.

When you update this file, **rewrite the affected section cohesively** — do not append patches to
the bottom. The next reader (human or agent) should be able to scan the section top-to-bottom and
understand it without archaeology.

---

## What this repo is

`projitect` is a project-scaffolding tool — Terraform for frontend projects. The user-facing
binary is `pjt`. Project maintainers declare a list of **blueprints** in `.pjt.ts`; `pjt build`
materializes them, `pjt remodel` updates the project to match, and `pjt inspect` reports drift
with a nonzero exit for CI.

This is a **pnpm monorepo** with five library packages, one binary package, and a marketing
site. All published packages version in **lockstep** via changesets — one shared version, matching
Effect v4's own release model.

## Package manager

**pnpm only.** Never npm, never yarn, never bun in this repo. The lockfile is `pnpm-lock.yaml`.

If `pnpm` is not found, escalate in this exact order — do not chain them:

1. Run the command as-is. If it works, stop.
2. Run `nvm use` (reads `.nvmrc`). Try again.
3. Run `source ~/.nvm/nvm.sh && nvm use`. Try again.
4. Only if all three fail, ask the user.

Do **not** prepend `cd /path/to/repo` to pnpm commands — pnpm respects the current working
directory. Chaining `cd && pnpm` triggers permission prompts unnecessarily.

## Node version

Pinned in `.nvmrc` to **22.12.0**. The published `engines.node` is `>=22.12.0`. We rely on Node
23.6+ for native TypeScript strip-types in user `.pjt.ts` files, with `tsx` as a fallback for
22.x users. Do not raise the floor without an open discussion.

## Verification ritual

Before claiming a task done, run **`pnpm check-all`** from the repo root. It runs, in order:

1. `pnpm tc` — `tsc --build` across all project references
2. `pnpm lint` — ESLint flat config
3. `pnpm format:check` — Prettier
4. `pnpm test` — Vitest (unit + integration with the in-memory `BlueprintFileSystem`)
5. `pnpm knip` — unused exports

If you only changed one package, you can run the same checks scoped: `pnpm --filter <pkg> tc`,
etc. — but `check-all` is the gate before merging.

Two additional checks run in CI but are also runnable locally:

- `pnpm --filter website check:examples` — every code snippet under `apps/website/examples/`
  typechecks. Marketing copy is not allowed to lie.
- `pnpm --filter website check:errors` — every error id exported by `@projitect/core` has a
  matching MDX page under `apps/website/src/content/docs/errors/`.

## Effect v4 conventions

This codebase is **Effect-native**. We use `effect@beta` (currently `4.0.0-beta.70`).

- **Services** use `ServiceMap.Service<...>` base class + a static `make` and `Layer.effect(this,
  this.make)`. Do not use the v3 `Effect.Tag` proxy accessor pattern.
- **Errors** use `Schema.TaggedError` (not `Data.TaggedError`) so they serialize cleanly to JSON
  for `pjt inspect --json`. Every error declares a semantic `id` field
  (`pjt.<subsystem>.<kebab-case>`) and has a matching MDX page in `apps/website`.
- **Layer composition** memoizes across `Effect.provide` calls by default in v4. Opt out with
  `{ local: true }` only when you have a specific reason.
- **Control flow** uses `Match.value(...).pipe(...)` and pattern matching, not `if/else` chains.
- **Conditional construction** uses `Effect.if`, `Effect.when`, `Effect.unless`, `Effect.forEach`,
  `Effect.all`. We do not ship our own `sequence`/`when`/`unless` blueprint combinators because
  Effect already has them.
- **Schema** v4 uses `.check(Schema.isInt(), Schema.isGreaterThan(0))` not
  `.pipe(Schema.int(), Schema.positive())`. Mind the migration on snippets copied from older docs.

## No type assertions

The `as` keyword is **forbidden** outside of `as const`. ESLint enforces this with a
`no-restricted-syntax` rule. When you reach for a cast, the right answer is one of:

- `Schema.decode(...)` — for runtime-validated narrowing
- `Match.value(...)` with exhaustive cases — for discriminated unions
- A `Predicate.is*` refinement function — for type guards
- A `parseX(...): Effect<X, ParseError>` boundary function — for "I'm parsing user input"

If none of those work, that's a sign the shape is wrong. Discuss before reaching for `as`.

## Blueprint authoring rules

Packages under `packages/blueprint*/` **must not** import `FileSystem` from `@effect/platform`.
ESLint enforces this. Blueprints use the `BlueprintFileSystem` service from
`@projitect/blueprint`, which wraps the real FS behind a `Permission`-gated interface.

This is our soft sandbox: blueprints declare what they need (`{ kind: "write", glob: "..." }`)
and `cli-internals` enforces the bounds at the Effect layer. A worker-process sandbox is a
tracked follow-up; the interface is designed to swap transparently when we ship it.

## Region marker convention

Region-owned file operations use comment-fenced markers. The format is:

```
<comment-prefix> pjt:<owner-id> start
... content ...
<comment-prefix> pjt:<owner-id> end
```

The comment prefix varies by file:
- `#` for `.gitignore`, `.editorconfig`, YAML, shell
- `//` for JS/TS/JSON5 (when the file is JSON5; standard JSON uses `merge` mode instead)
- `<!--` `-->` for HTML/MDX/XML

`owner-id` is the string the blueprint puts in its `id` field, e.g. `pjt:gitignore:macos`. Two
blueprints attempting to own the same region in the same file is a `pjt.plan.conflict` error.

## File ownership modes

Every blueprint operation declares one of four modes:

| Mode    | When to use                                                        |
|---------|--------------------------------------------------------------------|
| `region`| Text file, multiple blueprints can coexist (e.g., `.gitignore`)    |
| `merge` | Structured JSON, blueprint owns specific keys (e.g., `package.json`)|
| `owned` | Generated file, single blueprint owns whole content (e.g., generated TypeScript types) |
| `seed`  | Write-once, never enforced after (e.g., initial `.pjt.ts` content) |

See `docs/concepts/ownership-modes` on the marketing site for examples.

## Error catalog

Errors live in `packages/core/src/errors/`. To add a new one:

1. Define a new `Schema.TaggedError` class with an `id` field
2. Export it from `packages/core/src/errors/index.ts`
3. Add `apps/website/src/content/docs/errors/<id>.mdx` with **What**, **Why**, **How to fix**
4. `pnpm --filter website check:errors` will catch step 3 if you forget

Use the `new-error-code` skill in `.claude/skills/` to scaffold all three at once.

## Commits and PRs

- Conventional Commits enforced by commitlint
- One concept per commit; squash trivial fixups locally before opening a PR
- PR merge style: merge commit (never squash) — preserves the conventional commit history
- Run `pnpm check-all` before pushing

## No destructive shortcuts

When a check fails, fix the root cause. **Do not**:

- Add `as any` or `// @ts-ignore` to silence type errors
- Skip tests or mark them `.skip` to make CI green
- Commit with `--no-verify` to bypass hooks
- `pnpm install --ignore-scripts` to dodge a postinstall failure
- Delete a test that "doesn't apply anymore" without writing what replaces it

If you can't fix the underlying issue in this PR, leave it failing and flag it.

## CLAUDE.md ↔ AGENTS.md

`CLAUDE.md` is a symbolic link to this file. If you find yourself editing both, you've broken
the symlink — restore it with `ln -sf AGENTS.md CLAUDE.md` from the repo root.
