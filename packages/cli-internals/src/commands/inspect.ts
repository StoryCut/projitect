import { Effect } from "effect"
import type { Errors } from "@projitect/core"
import { type ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree, type BlueprintTree } from "../loader.js"
import { buildPlan, diffLockfile } from "../plan.js"
import { diffPlan, renderInspectReport } from "../differ.js"
import { makeRealLayer } from "../filesystem-impl.js"
import { readLockfile } from "../lockfile.js"

export interface InspectResult {
  readonly hasDrift: boolean
  readonly output: string
}

/**
 * `pjt inspect` — load the blueprint file, build the plan, diff against disk + lockfile, and
 * return a human-readable summary plus a `hasDrift` boolean. The bin shim exits with code 1
 * when `hasDrift` is true, satisfying the CI use case.
 */
export const inspect = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
}): Effect.Effect<InspectResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const file = yield* loadBlueprintFile({
      blueprintFile: params.config.blueprintFile,
      projectRoot: params.config.projectRoot,
    })
    const tree: BlueprintTree = isEffectTree(file.blueprints)
      ? yield* file.blueprints.pipe(
          Effect.provide(
            makeRealLayer({
              blueprintId: "pjt:config-loader",
              permissions: [{ kind: "read", glob: "**" }],
              projectRoot: params.config.projectRoot,
            }),
          ),
        )
      : file.blueprints
    const { plan, byBlueprint } = yield* buildPlan({
      tree,
      projectRoot: params.config.projectRoot,
    })
    const previous = yield* readLockfile({ projectRoot: params.config.projectRoot })
    const { removals, upgrades } = diffLockfile({ previous, current: byBlueprint })
    const diff = yield* diffPlan({ plan, projectRoot: params.config.projectRoot })
    const hasDrift = diff.hasDrift || removals.length > 0
    return {
      hasDrift,
      output: renderInspectReport({ diff, removals, upgrades }),
    }
  })
