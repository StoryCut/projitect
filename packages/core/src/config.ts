import { Schema } from "effect"

/**
 * `ProjitectConfig` resolves through a four-layer reducer:
 *
 *   defaults → env (`PJT_*`) → `.pjt.ts` `config:` field → CLI args
 *
 * Each layer's value is a partial config; layers later in the chain override earlier ones. The
 * final resolved value is what every command consumes.
 */
export const ProjitectConfig = Schema.Struct({
  /** Absolute path to the project root. Defaults to the directory containing `.pjt.ts`. */
  projectRoot: Schema.String,
  /** Path to the user's blueprint file, relative to projectRoot. Defaults to `.pjt.ts`. */
  blueprintFile: Schema.String,
  /** Whether `build` requires a clean git working tree before destroying the project. Default true. */
  requireCleanGit: Schema.Boolean,
  /** Whether to emit JSON output for `inspect` / `remodel` (machine-readable). Default false. */
  jsonOutput: Schema.Boolean,
  /** Verbosity. 0=quiet, 1=normal, 2=verbose, 3=debug. */
  verbosity: Schema.Number,
})

export type ProjitectConfig = typeof ProjitectConfig.Type

export const defaults: ProjitectConfig = {
  projectRoot: process.cwd(),
  blueprintFile: ".pjt.ts",
  requireCleanGit: true,
  jsonOutput: false,
  verbosity: 1,
}

/**
 * Reduce a list of partial overrides into a single resolved config, applying them left-to-right.
 * Later overrides win.
 */
export const resolve = (...overrides: readonly Partial<ProjitectConfig>[]): ProjitectConfig =>
  overrides.reduce<ProjitectConfig>((accumulator, o) => ({ ...accumulator, ...o }), defaults)
