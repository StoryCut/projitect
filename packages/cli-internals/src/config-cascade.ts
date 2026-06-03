import { Array, Predicate } from "effect"
import { ProjitectConfig } from "@projitect/core"
import { StructX } from "@projitect/internal"

/** Partial config with mutable properties — for building up an override layer locally. */
export type WritablePartialConfig = {
  -readonly [K in keyof ProjitectConfig.ProjitectConfig]?: ProjitectConfig.ProjitectConfig[K]
}

/**
 * Resolve the four config layers into a single `ProjitectConfig`. Later layers win.
 *
 * Layers, in priority order (low to high):
 *   1. `ProjitectConfig.defaults`
 *   2. `env`: parsed `PJT_*` environment variables
 *   3. `blueprintFile`: the `config:` field of the user's `.pjt.ts`
 *   4. `cliArgs`: command-line overrides
 */
export const resolveConfig = (layers: {
  readonly env?: WritablePartialConfig
  readonly blueprintFile?: WritablePartialConfig
  readonly cliArgs?: WritablePartialConfig
}): ProjitectConfig.ProjitectConfig =>
  ProjitectConfig.resolve(
    ...Array.filter([layers.env, layers.blueprintFile, layers.cliArgs], Predicate.isNotUndefined),
  )

/**
 * Parse the relevant `PJT_*` environment variables into a partial config. Unknown vars are
 * ignored. Boolean vars accept `1`/`0`/`true`/`false`; numeric vars are parsed with `Number`.
 */
export const parseEnv = (
  env: Readonly<Record<string, string | undefined>>,
): WritablePartialConfig =>
  StructX.filterDefined({
    projectRoot: env["PJT_PROJECT_ROOT"],
    blueprintFile: env["PJT_BLUEPRINT_FILE"],
    requireCleanGit: parseBool(env["PJT_REQUIRE_CLEAN_GIT"]),
    jsonOutput: parseBool(env["PJT_JSON_OUTPUT"]),
    verbosity: parseNumber(env["PJT_VERBOSITY"]),
  })

const parseBool = (v: string | undefined): boolean | undefined => {
  if (v === undefined) {
    return undefined
  }
  if (v === "1" || v.toLowerCase() === "true") {
    return true
  }
  if (v === "0" || v.toLowerCase() === "false") {
    return false
  }
  return undefined
}

const parseNumber = (v: string | undefined): number | undefined => {
  if (v === undefined) {
    return undefined
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
