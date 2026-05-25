import { Effect } from "effect"
import type { Errors} from "@projitect/core";
import { type ProjitectConfig } from "@projitect/core"

/**
 * `pjt build --force` — scratch-build the project from scratch.
 *
 * v0: stub. Full implementation needs a git status check, a `--force` requirement, and a recursive
 * project wipe before applying the plan. Tracked for v0.1.
 */
export const build = (_params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly force: boolean
}): Effect.Effect<{ readonly written: ReadonlyArray<string> }, Errors.ApplyDirtyGit> =>
  Effect.succeed({ written: [] })
