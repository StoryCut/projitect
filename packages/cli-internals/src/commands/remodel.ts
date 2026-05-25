import { Effect } from "effect"
import type { Errors} from "@projitect/core";
import { type ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree, type BlueprintTree } from "../loader.js"
import { buildPlan } from "../plan.js"
import { applyPlan } from "../applier.js"
import { makeRealLayer } from "../filesystem-impl.js"

export interface RemodelResult {
  readonly written: ReadonlyArray<string>
}

/**
 * `pjt remodel` — load blueprints, build the plan, apply changes to disk. Non-destructive: only
 * touches files the plan covers, leaves everything else alone.
 */
export const remodel = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
}): Effect.Effect<RemodelResult, Errors.ProjitectError> =>
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
    const written = yield* applyPlan({ plan, projectRoot: params.config.projectRoot })
    return { written }
  })
