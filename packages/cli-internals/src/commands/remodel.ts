import { Effect } from "effect"
import type { Errors, PjtLock, ProjitectConfig } from "@projitect/core"
import { loadBlueprintFile, isEffectTree } from "../loader.js"
import type { BlueprintTree } from "../loader.js"
import { buildPlan, diffLockfile } from "../plan.js"
import { applyPlan } from "../applier.js"
import { applyRemovals } from "../remover.js"
import { makeRealLayer } from "../filesystem-impl.js"
import { readLockfile, writeLockfile } from "../lockfile.js"

export interface RemodelResult {
  readonly written: readonly string[]
  readonly removed: readonly string[]
}

/**
 * `pjt remodel` — load blueprints, build the plan, apply changes to disk, rewrite `.pjt.lock`.
 * Non-destructive at the file-tree level: only touches files the plan covers (additions) and
 * files where a blueprint that previously had ownership left the tree (removals).
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

    const { plan, byBlueprint } = yield* buildPlan({
      tree,
      projectRoot: params.config.projectRoot,
    })
    const previous = yield* readLockfile({ projectRoot: params.config.projectRoot })
    const { removals } = diffLockfile({ previous, current: byBlueprint })

    const written = yield* applyPlan({ plan, projectRoot: params.config.projectRoot })
    const removed = yield* applyRemovals({ removals, projectRoot: params.config.projectRoot })

    const nextLock: PjtLock.PjtLock = { version: 1, blueprints: byBlueprint }
    yield* writeLockfile({ projectRoot: params.config.projectRoot, lock: nextLock })

    return { written, removed }
  })
