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
2. `pnpm lint` — ESLint flat config (covers code style + Prettier formatting via `eslint-plugin-prettier`; no separate `format:check` step)
3. `pnpm test` — Vitest (unit + integration with the in-memory `BlueprintFileSystem`)
4. `pnpm knip` — unused exports

If you only changed one package, you can run the same checks scoped: `pnpm --filter <pkg> tc`,
etc. — but `check-all` is the gate before merging.

Three additional checks run in CI but are also runnable locally:

- `pnpm --filter website check:examples` — every code snippet under `apps/website/examples/`
  typechecks. Marketing copy is not allowed to lie.
- `pnpm --filter website check:errors` — every error id exported by `@projitect/core` has a
  matching MDX page under `apps/website/src/content/docs/errors/`.
- `./scripts/smoke.sh` — end-to-end smoke covering init → add → remodel → inspect → lockfile
  orphan removal → build --force in a throwaway `/tmp` project. Heaviest gate; run when you've
  touched the CLI pipeline.

## ESLint absorbs Prettier

One tool, one config, one command. Adapted from StoryCut's and effect-clue's flat configs:

- `eslint-plugin-prettier/recommended` runs Prettier as an ESLint rule. Formatting drift surfaces as a `prettier/prettier` lint error — no separate `prettier --check` step.
- For files ESLint doesn't parse (MDX, YAML, JSON5, CSS) the `pnpm format` script invokes Prettier directly. `lint-staged` covers them automatically on commit.
- The Unicorn recommended preset is enabled with a small list of overrides for rules that clash with Effect-heavy code (`no-null`, `custom-error-definition`, `no-array-reduce`, etc.). See [eslint.config.js](./eslint.config.js) for the canonical list with rationale.
- `eslint-plugin-package-json` validates every `package.json` in the monorepo: required fields, npm-standard property order, alphabetized dependencies. Catches "would-publish-but-broken" mistakes alongside the `publish-dry-run` CI job.

Per-package sandbox enforcement at lint time (the "soft" half of the soft sandbox):

| Files                                              | Banned imports                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/blueprint/**`, `packages/blueprint-*/**` | `@effect/platform`'s `FileSystem`, all `node:*` — blueprints must go through `BlueprintFileSystem`      |
| `packages/core/**`                                 | All `node:*` — core stays runtime-pure so it can run in a browser (planned interactive in-browser demo) |
| `packages/test-kit/**`                             | All `node:*` — test-kit is an in-memory FS by definition; touching the disk would defeat its purpose    |

`pnpm lint` is the single command. `pnpm lint:fix` applies autofixes. CI runs `pnpm lint`; no `format-check` job.

## Reach for ESLint first

Whenever you introduce a new dep, library, framework, or architectural rule — or notice a class
of bug that "should have been caught automatically" — **check whether an ESLint plugin (or a
hand-written `no-restricted-imports` / `no-restricted-syntax` rule) can enforce the constraint
mechanically**. This is a default reflex, not an after-the-fact polish.

Static linting is the cheapest enforcement layer in the stack. It runs on every save (IDE), every
commit (`lint-staged`), and every CI run. Promoting a rule from code review or docs up to lint
multiplies its leverage:

- **Code review** catches the issue once, for the patient reviewer who notices.
- **Docs** hope the next author reads them.
- **ESLint** stops the wrong pattern from ever being committed.

### Triggers — always ask "is there a plugin or rule for this?"

| Trigger                                                                                                                 | Lookup                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a new npm dep                                                                                                    | Search `npm` for `eslint-plugin-<name>` and read the dep's own README. Most popular libraries ship one (React, Tailwind, Vitest, Astro, Next, etc.).                               |
| Adding a new framework or runtime                                                                                       | Check the framework's recommended ESLint preset. Bring it in even if you only need a subset of rules — drop the rest with overrides.                                               |
| Introducing an architectural rule (e.g. "blueprints can't import `@effect/platform`'s `FileSystem`", "core stays pure") | Hand-roll a `no-restricted-imports` / `no-restricted-syntax` rule, scoped via `files:` to the relevant directories. See the per-package sandbox bans above for canonical examples. |
| A code-review finding that turns out to be a class of bug, not a one-off                                                | Find or write a lint rule **before** the PR merges. The cost is one-time; the saving compounds.                                                                                    |
| A `tsc --build` diagnostic the Effect LS surfaces repeatedly                                                            | The diagnostic itself is the rule — fix the violation, and the patch is doing its job. (If it surfaces a recurring pattern, also note it in this file.)                            |

If no plugin or rule fits your case, leave a one-line note in the PR description so the next dep
upgrade or refactor pass can revisit. Don't silently absorb the constraint into "team lore."

## Effect language service

The package's `prepare` script runs `effect-language-service patch` on every `pnpm install`. This patches the local `node_modules/typescript` so that **`tsc --build` produces Effect-specific diagnostics in addition to the standard TS checks** — things like `yield* Effect.fail(new X())` being flagged as redundant (since `new X()` is itself yieldable for `Schema.TaggedErrorClass` errors), `Effect.sync` thunks accidentally returning a Promise, missing Effect requirements, etc.

If you delete `.tsbuildinfo` files or wipe `node_modules` and the patch doesn't seem to be applied, run `pnpm install` to re-fire `prepare`. `pnpm effect-language-service check` verifies the patch state.

The `tsconfig.base.json`'s `"plugins": [{ "name": "@effect/language-service" }]` covers the editor / LSP side. The `patch` covers the build / CLI side. Both should be active.

## Pre-commit hooks (husky + lint-staged)

Configured via the root [`package.json`](./package.json)'s `lint-staged` field and
[`.husky/pre-commit`](./.husky/pre-commit).

- JS / TS files: `eslint --fix --max-warnings=0` — runs ESLint with the prettier integration, fixes what it can, fails the commit on any remaining issue.
- MDX / YAML / JSON5 / CSS files: `prettier --write`.

Husky is bootstrapped via the `prepare` script — `pnpm install` triggers `husky` which creates `.husky/_/` for the runner shims. The actual hook (`pre-commit`) is committed.

When a commit is blocked: read the lint-staged output, fix the surfaced errors, and re-stage. Don't `git commit --no-verify` to bypass — `--no-verify` is forbidden by the "no destructive shortcuts" rule below.

## CI (GitHub Actions)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) defines one job per check. All ten jobs
run in parallel on every PR and every push to `main`. Concurrency group cancels in-progress
runs on new pushes to the same ref. Default Node version is sourced from `.nvmrc` (22.12);
behavioral jobs run a 22 + 24 matrix.

| Job               | Matrix       | What it runs                                                                        |
| ----------------- | ------------ | ----------------------------------------------------------------------------------- |
| `typecheck`       | node 22 / 24 | `pnpm tc`                                                                           |
| `lint`            | (.nvmrc)     | `pnpm lint` (code style + Prettier formatting via `eslint-plugin-prettier`)         |
| `test`            | node 22 / 24 | `pnpm test` (Vitest unit suites; `needs: build-packages`)                           |
| `knip`            | (.nvmrc)     | `pnpm knip`                                                                         |
| `build-packages`  | (.nvmrc)     | `pnpm build` — uploads `packages/*/dist/` as a build artifact                       |
| `build-website`   | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website build`                    |
| `check-errors`    | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website check:errors`             |
| `check-examples`  | (.nvmrc)     | downloads the build artifact, then `pnpm --filter website check:examples`           |
| `smoke`           | node 22 / 24 | downloads the build artifact, then `./scripts/smoke.sh`                             |
| `publish-dry-run` | (.nvmrc)     | `pnpm -r --filter './packages/*' publish --dry-run --no-git-checks --access public` |

Only `typecheck`, `test`, and `smoke` get the 22 + 24 matrix. Those three are the ones whose
outcome can genuinely depend on Node version (TS strip-types behavior, Node API additions /
removals between majors, smoke-script `node` invocations). `lint` / `knip` / `build-packages`
have no Node-version-dependent behavior worth matrixing — they run on the .nvmrc default.

The setup action at `.github/actions/setup/action.yml` accepts an optional `node-version`
input; matrixed jobs pass `${{ matrix.node }}`, others omit it and fall through to .nvmrc.

Total wall-clock ≈ 60-90s (bounded by `smoke`). If a check passes locally but fails in CI,
prefer "fix the workflow's pnpm-store cache" or "fix the underlying determinism" — never `if:`
the check off.

Snapshot npm publishes on PR branches are a tracked follow-up.

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

Region-owned file operations use comment-fenced markers. Two shapes:

**Single-prefix** (`#`, `//`, `--`, `;`, etc.) — marker terminates at end-of-line:

```
<comment-prefix> pjt:<owner-id> start
... content ...
<comment-prefix> pjt:<owner-id> end
```

**Prefix + suffix pair** (HTML/MDX/XML) — marker needs a closing delimiter:

```
<comment-prefix> pjt:<owner-id> start<comment-suffix>
... content ...
<comment-prefix> pjt:<owner-id> end<comment-suffix>
```

Comment style by file:

| File                                                          | Prefix | Suffix |
| ------------------------------------------------------------- | ------ | ------ |
| `.gitignore`, `.eslintignore`, `.prettierignore`, YAML, shell | `#`    | (none) |
| JS/TS/JSON5                                                   | `//`   | (none) |
| HTML, MDX, XML, `README.md`, `AGENTS.md`                      | `<!--` | ` -->` |

The `@projitect/blueprint` SDK ships two helpers that bake in the right pair so authors
don't have to remember them: `ignoreSection({ ... })` for `#`-comment files, `markdownSection({ ... })`
for HTML/MDX. Reach for those before dropping down to `regionFile({ commentPrefix, commentSuffix, ... })`.

`owner-id` is the string the blueprint puts in its `id` field, e.g. `pjt:gitignore:macos`. Two
blueprints attempting to own the same region in the same file is a `pjt.plan.conflict` error.

## File ownership modes

Every blueprint operation declares one of four modes:

| Mode     | When to use                                                                            |
| -------- | -------------------------------------------------------------------------------------- |
| `region` | Text file, multiple blueprints can coexist (e.g., `.gitignore`)                        |
| `merge`  | Structured JSON, blueprint owns specific keys (e.g., `package.json`)                   |
| `owned`  | Generated file, single blueprint owns whole content (e.g., generated TypeScript types) |
| `seed`   | Write-once, never enforced after (e.g., initial `.pjt.ts` content)                     |

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

## Marketing site is latest-only

The Astro Starlight site under `apps/website` is written in **present tense as if the latest
version is the only one that ever existed**. Historical docs are out of scope for v0.x.

- Renaming a flag means updating every reference on the site, not adding a "previously named X" note.
- Removing a feature means deleting its docs, not marking them deprecated.
- Adding a feature means adding its docs in the same PR.
- Versioned URLs are not in scope.

This is a stylistic standard. Reviewers reject docs that read like a changelog.

## Marketing site coordination at every phase

The site is not a release-time chore — it's a **continuous obligation**. Three sequential gates:

### Plan-time

Every plan in `~/.claude/plans/` that introduces a user-facing change must explicitly list
which marketing pages it will touch. "Add `--json` flag to `pjt inspect`" without naming
`apps/website/src/content/docs/docs/cli/inspect.mdx` is an incomplete plan.

Triggers — if your change does any of the following, plan a docs edit:

| Change                                                                          | Docs to touch                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Add / rename / remove a CLI command, flag, or argument                          | `docs/cli/<cmd>.mdx`                                                                               |
| Add / rename / remove an SDK export, blueprint constructor, or permission shape | `docs/authoring.mdx` (+ maybe `docs/concepts/*.mdx`)                                               |
| Change an ownership mode's behavior or add a new mode                           | `docs/concepts/ownership-modes.mdx`                                                                |
| Add / rename a `pjt.*` error id                                                 | `errors/<id>.mdx` (gated by `check:errors`)                                                        |
| Change marketing copy that's now untrue                                         | `index.mdx` + relevant pages                                                                       |
| Add or change a worked example                                                  | `apps/website/examples/<name>/example.ts` + `docs/examples/<name>.mdx` (gated by `check:examples`) |
| Change the lockfile schema, projitect blueprint, or pipeline shape              | `docs/concepts/drift-detection.mdx` + `docs/concepts/blueprints.mdx`                               |

### Implementation-time

**The PR that lands the code change must also land the marketing edits.** No "docs follow-up"
PRs. CI gates:

- `pnpm --filter website check:errors` — every error id has an MDX page.
- `pnpm --filter website check:examples` — every example file under `apps/website/examples/` typechecks.
- `pnpm --filter website build` — the Astro site builds end-to-end.

The human reviewer additionally checks the prose on touched pages for freshness.

### Release-time

At release time the docs are already correct by construction. The procedural parts (changeset,
version bump, publish) are handled by the `release-bump` skill at `.claude/skills/release-bump/`.

## Versioning (lockstep)

All published packages (`projitect` and every `@projitect/*`) share one version, bumped together
via changesets. Pick the bump type per this table — cite the rule when running `pnpm changeset`:

| Change                                                                                                                                                         | Bump      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Breaking change in any public API (Blueprint shape, ChangeSet shape, Permission shape, CLI flag rename/removal, error id rename/removal, lockfile schema bump) | **major** |
| New public feature (new ownership mode, new CLI command, new error class with new id, new SDK helper, new blueprint package)                                   | **minor** |
| Bug fix, doc-only change, internal refactor, dep bump that doesn't change consumer-visible behavior                                                            | **patch** |

When in doubt about bump severity, pick the higher one. Cost of an unnecessary major is low (no
consumer breakage); cost of an unannounced major is high.

## Dependency upgrades (Renovate)

Renovate runs on this repo and opens PRs for dep upgrades. Configured at
[renovate.json5](./renovate.json5). Two things to know:

- Most packages are published libraries, so the default `rangeStrategy` is `update` (caret/tilde ranges preserved — consumers dedupe). The workspace root `package.json` and `apps/website/package.json` are private, so they pin exact versions via `matchFileNames` overrides.
- Non-major bumps, devDep majors, and lockfile maintenance auto-merge. Runtime-dep majors (Effect v3 → v4, etc.) wait for human approval. PRs queue for `minimumReleaseAge` (3-8 days depending on dep type) to dodge the npm 72-hour unpublish window.

When adding a new published `@projitect/*` package: nothing to do — it inherits the default js-lib semantics. When adding a new `apps/*` private package: extend the `matchFileNames` rule to include it.

## CLAUDE.md ↔ AGENTS.md

`CLAUDE.md` is a symbolic link to this file. If you find yourself editing both, you've broken
the symlink — restore it with `ln -sf AGENTS.md CLAUDE.md` from the repo root.
