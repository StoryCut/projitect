import { Effect } from "effect"
import type { ChangeSet, Blueprint } from "@projitect/core"
import { Errors } from "@projitect/core"
import { makeRealLayer } from "./filesystem-impl.js"
import type { DirectoryBlueprint } from "@projitect/blueprint"
import { isDirectoryBlueprint } from "@projitect/blueprint"

// ---------------------------------------------------------------------------
// File-level plan shape (after reducing all blueprints' ChangeSets per path)
// ---------------------------------------------------------------------------

export interface RegionPlanFile {
  readonly kind: "region"
  readonly path: string
  readonly commentPrefix: string
  readonly regions: ReadonlyArray<{ readonly ownerId: string; readonly content: string }>
}

export interface MergePlanFile {
  readonly kind: "merge"
  readonly path: string
  readonly value: unknown
  /** Dotted-key → ownerId. Conflicts on identical keys are caught at reduction time. */
  readonly ownership: ReadonlyMap<string, string>
}

export interface OwnedPlanFile {
  readonly kind: "owned"
  readonly path: string
  readonly ownerId: string
  readonly content: string
}

export interface SeedPlanFile {
  readonly kind: "seed"
  readonly path: string
  readonly ownerId: string
  readonly content: string
}

export type FilePlan = RegionPlanFile | MergePlanFile | OwnedPlanFile | SeedPlanFile

export interface ProjectPlan {
  readonly files: ReadonlyArray<FilePlan>
}

// ---------------------------------------------------------------------------
// Flatten the tree (directory wrapping, sequence implicit via array order)
// ---------------------------------------------------------------------------

type RawTree = ReadonlyArray<Blueprint.Blueprint | DirectoryBlueprint>

interface FlatBlueprint {
  readonly blueprint: Blueprint.Blueprint
  readonly directoryPrefix: string
}

const flattenTree = (
  tree: RawTree,
  prefix: string,
  acc: Array<FlatBlueprint>,
): Array<FlatBlueprint> => {
  for (const node of tree) {
    if (isDirectoryBlueprint(node)) {
      flattenTree(node.children, prefix ? `${prefix}/${node.name}` : node.name, acc)
    } else {
      acc.push({ blueprint: node, directoryPrefix: prefix })
    }
  }
  return acc
}

// ---------------------------------------------------------------------------
// Run each blueprint's plan Effect with its own permission-gated FS layer,
// collect operations, and reduce them into a ProjectPlan
// ---------------------------------------------------------------------------

const rebasePath = (prefix: string, p: string): string => (prefix ? `${prefix}/${p}` : p)

const rebaseOp = (prefix: string, op: ChangeSet.Operation): ChangeSet.Operation => {
  if (!prefix) return op
  return { ...op, path: rebasePath(prefix, op.path) }
}

/**
 * Build the project plan by running every blueprint, collecting their ops, and reducing them
 * with conflict detection.
 */
export const buildPlan = (params: {
  readonly tree: RawTree
  readonly projectRoot: string
}): Effect.Effect<ProjectPlan, Errors.ProjitectError> => {
  const { tree, projectRoot } = params
  const flat = flattenTree(tree, "", [])

  return Effect.gen(function* () {
    const allOps: Array<ChangeSet.Operation> = []

    for (const { blueprint, directoryPrefix } of flat) {
      const layer = makeRealLayer({
        blueprintId: blueprint.id,
        permissions: blueprint.permissions,
        projectRoot,
      })
      const changeSet = yield* blueprint.plan.pipe(Effect.provide(layer))
      for (const op of changeSet.operations) {
        allOps.push(rebaseOp(directoryPrefix, op))
      }
    }

    return yield* reduceOps(allOps)
  })
}

// ---------------------------------------------------------------------------
// Reduce raw ops into a ProjectPlan, detecting conflicts as we go
// ---------------------------------------------------------------------------

const reduceOps = (
  ops: ReadonlyArray<ChangeSet.Operation>,
): Effect.Effect<ProjectPlan, Errors.PlanError> =>
  Effect.gen(function* () {
    const byPath = new Map<string, Array<ChangeSet.Operation>>()
    for (const op of ops) {
      const arr = byPath.get(op.path) ?? []
      arr.push(op)
      byPath.set(op.path, arr)
    }

    const files: Array<FilePlan> = []
    for (const [filePath, opsForPath] of byPath) {
      const first = opsForPath[0]!
      const mode = first.mode

      // All ops on a single file must share the same mode
      for (const op of opsForPath) {
        if (op.mode !== mode) {
          return yield* Effect.fail(
            new Errors.PlanConflictOwned({
              id: "pjt.plan.conflict-owned",
              path: filePath,
              ownerA: first.ownerId,
              ownerB: op.ownerId,
              message: `Blueprints ${first.ownerId} (${mode}) and ${op.ownerId} (${op.mode}) both target ${filePath} with incompatible modes`,
            }),
          )
        }
      }

      switch (mode) {
        case "region": {
          const regionOps = opsForPath as ReadonlyArray<ChangeSet.RegionOp>
          const seen = new Map<string, string>() // ownerId → ownerId (sentinel)
          const regions: Array<{ ownerId: string; content: string }> = []
          let commentPrefix = regionOps[0]!.commentPrefix
          for (const op of regionOps) {
            if (seen.has(op.ownerId)) {
              return yield* Effect.fail(
                new Errors.PlanConflictRegion({
                  id: "pjt.plan.conflict-region",
                  path: filePath,
                  ownerA: op.ownerId,
                  ownerB: op.ownerId,
                  message: `Multiple blueprints share ownerId ${op.ownerId} for region in ${filePath}`,
                }),
              )
            }
            seen.set(op.ownerId, op.ownerId)
            if (op.commentPrefix !== commentPrefix) {
              commentPrefix = op.commentPrefix
            }
            regions.push({ ownerId: op.ownerId, content: op.content })
          }
          files.push({ kind: "region", path: filePath, commentPrefix, regions })
          break
        }
        case "merge": {
          const mergeOps = opsForPath as ReadonlyArray<ChangeSet.MergeOp>
          const ownership = new Map<string, string>()
          let merged: unknown = {}
          for (const op of mergeOps) {
            for (const key of op.ownedKeys) {
              const prior = ownership.get(key)
              if (prior !== undefined && prior !== op.ownerId) {
                return yield* Effect.fail(
                  new Errors.PlanConflictMerge({
                    id: "pjt.plan.conflict-merge",
                    path: filePath,
                    key,
                    ownerA: prior,
                    ownerB: op.ownerId,
                    message: `Blueprints ${prior} and ${op.ownerId} both claim key "${key}" in ${filePath}`,
                  }),
                )
              }
              ownership.set(key, op.ownerId)
            }
            merged = deepMerge(merged, op.value)
          }
          files.push({ kind: "merge", path: filePath, value: merged, ownership })
          break
        }
        case "owned": {
          if (opsForPath.length > 1) {
            return yield* Effect.fail(
              new Errors.PlanConflictOwned({
                id: "pjt.plan.conflict-owned",
                path: filePath,
                ownerA: opsForPath[0]!.ownerId,
                ownerB: opsForPath[1]!.ownerId,
                message: `Multiple blueprints claim full ownership of ${filePath}`,
              }),
            )
          }
          const op = first
          files.push({
            kind: "owned",
            path: filePath,
            ownerId: op.ownerId,
            content: op.content,
          })
          break
        }
        case "seed": {
          if (opsForPath.length > 1) {
            return yield* Effect.fail(
              new Errors.PlanConflictOwned({
                id: "pjt.plan.conflict-owned",
                path: filePath,
                ownerA: opsForPath[0]!.ownerId,
                ownerB: opsForPath[1]!.ownerId,
                message: `Multiple blueprints try to seed ${filePath}`,
              }),
            )
          }
          const op = first
          files.push({ kind: "seed", path: filePath, ownerId: op.ownerId, content: op.content })
          break
        }
      }
    }

    return { files }
  })

// ---------------------------------------------------------------------------
// Minimal deep-merge for JSON values. Arrays are replaced (no concat); plain objects merge.
// ---------------------------------------------------------------------------

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const deepMerge = (a: unknown, b: unknown): unknown => {
  if (!isPlainObject(a) || !isPlainObject(b)) return b
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in a ? deepMerge(a[k], v) : v
  }
  return out
}

