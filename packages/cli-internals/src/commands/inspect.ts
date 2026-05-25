import { Effect } from "effect"
import type { Errors} from "@projitect/core";
import { type ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree, type BlueprintTree } from "../loader.js"
import { buildPlan } from "../plan.js"
import { diffPlan, renderPlanDiff } from "../differ.js"
import { makeRealLayer } from "../filesystem-impl.js"

export interface InspectResult {
  readonly hasDrift: boolean
  readonly output: string
}

/**
 * `pjt inspect` — load the blueprint file, build the plan, diff against disk, and return a
 * human-readable summary plus a `hasDrift` boolean. The bin shim exits with code 1 when
 * `hasDrift` is true, satisfying the CI use case.
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
    const plan = yield* buildPlan({ tree, projectRoot: params.config.projectRoot })
    const diff = yield* diffPlan({ plan, projectRoot: params.config.projectRoot })
    return { hasDrift: diff.hasDrift, output: renderPlanDiff(diff) }
  })
