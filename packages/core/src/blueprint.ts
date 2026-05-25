import type { Effect } from "effect"
import type { ChangeSet } from "./change-set.js"
import type { BlueprintFileSystem } from "./blueprint-filesystem.js"
import type { Permission } from "./permissions.js"
import type { BlueprintError } from "./errors/index.js"

/**
 * A `Blueprint` is a unit of project scaffolding. The CLI plans every blueprint by running its
 * `plan` Effect to produce a `ChangeSet`, then either applies the union of changes (`build`,
 * `remodel`) or compares them against the current project state (`inspect`).
 *
 * Blueprints **never** import `FileSystem` from `@effect/platform`. They use the
 * `BlueprintFileSystem` service from `@projitect/blueprint`, which is gated by the `permissions`
 * the blueprint declares. This is enforced by an ESLint rule.
 */
export interface Blueprint {
  /** Stable kebab-case identifier, e.g. `pjt:gitignore:macos`. Used as ownership key in regions and merges. */
  readonly id: string
  /** Semver string of the blueprint version. Used for change-tracking across upgrades. */
  readonly version: string
  /** Human-readable, one-line description shown in `pjt inspect` output. */
  readonly description?: string
  /** Declared capabilities. The CLI rejects FS operations not covered by this set. */
  readonly permissions: ReadonlyArray<Permission>
  /** The Effect that produces this blueprint's change set when planned. */
  readonly plan: Effect.Effect<ChangeSet, BlueprintError, BlueprintFileSystem>
}
