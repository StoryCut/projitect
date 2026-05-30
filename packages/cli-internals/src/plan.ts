import { Effect } from "effect"
import type { ChangeSet, Blueprint, PjtLock } from "@projitect/core"
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
  /** Optional closing delimiter for HTML/MDX comments. Empty for `#`/`//`-style regions. */
  readonly commentSuffix: string
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

/**
 * Per-blueprint lockfile entries, derived from the same ops that fed the plan. Written to
 * `.pjt.lock` after every successful apply.
 */
export type ByBlueprint = Readonly<Record<string, PjtLock.BlueprintLockEntry>>

/**
 * Removal computed by diffing the previous lockfile against the current `byBlueprint` map.
 * A blueprint that appears in the previous lockfile but not in the current map is "left the
 * tree"; each of its prior operations becomes a removal target.
 */
export interface UpgradeRecord {
  readonly blueprintId: string
  readonly from: string
  readonly to: string
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
  accumulator: Array<FlatBlueprint>,
): Array<FlatBlueprint> => {
  for (const node of tree) {
    if (isDirectoryBlueprint(node)) {
      flattenTree(node.children, prefix ? `${prefix}/${node.name}` : node.name, accumulator)
    } else {
      accumulator.push({ blueprint: node, directoryPrefix: prefix })
    }
  }
  return accumulator
}

// ---------------------------------------------------------------------------
// Run each blueprint's plan Effect with its own permission-gated FS layer,
// collect operations, and reduce them into a ProjectPlan + per-blueprint lockfile entries
// ---------------------------------------------------------------------------

const rebasePath = (prefix: string, p: string): string => (prefix ? `${prefix}/${p}` : p)

const rebaseOp = (prefix: string, op: ChangeSet.Operation): ChangeSet.Operation => {
  if (!prefix) return op
  return { ...op, path: rebasePath(prefix, op.path) }
}

interface AttributedOp {
  readonly blueprintId: string
  readonly blueprintVersion: string
  readonly op: ChangeSet.Operation
}

/**
 * Build the project plan by running every blueprint, collecting their ops, reducing them with
 * conflict detection, and producing the per-blueprint lockfile entries.
 */
export const buildPlan = (params: {
  readonly tree: RawTree
  readonly projectRoot: string
}): Effect.Effect<
  { readonly plan: ProjectPlan; readonly byBlueprint: ByBlueprint },
  Errors.ProjitectError
> => {
  const { tree, projectRoot } = params
  const flat = flattenTree(tree, "", [])

  return Effect.gen(function* () {
    const attributed: Array<AttributedOp> = []

    for (const { blueprint, directoryPrefix } of flat) {
      const layer = makeRealLayer({
        blueprintId: blueprint.id,
        permissions: blueprint.permissions,
        projectRoot,
      })
      const changeSet = yield* blueprint.plan.pipe(Effect.provide(layer))
      for (const op of changeSet.operations) {
        attributed.push({
          blueprintId: blueprint.id,
          blueprintVersion: blueprint.version,
          op: rebaseOp(directoryPrefix, op),
        })
      }
    }

    const plan = yield* reduceOps(attributed.map((a) => a.op))
    const byBlueprint = groupByBlueprint(attributed)
    return { plan, byBlueprint }
  })
}

/**
 * Diff the previous lockfile against the current blueprint set. Returns:
 * - `removals`: ops from blueprints present in the lockfile but absent from the current tree.
 *   The applier deletes the matching regions / merge keys / owned files in a follow-up step.
 * - `upgrades`: blueprints present in both, with different versions. Informational only — the
 *   actual content is regenerated from the current blueprint, so applying handles upgrade
 *   content automatically; this list is for `inspect`'s human output.
 */
export const diffLockfile = (params: {
  readonly previous: PjtLock.PjtLock | null
  readonly current: ByBlueprint
}): {
  readonly removals: ReadonlyArray<PjtLock.LockOperation>
  readonly upgrades: ReadonlyArray<UpgradeRecord>
} => {
  const { previous, current } = params
  if (previous === null) return { removals: [], upgrades: [] }

  const removals: Array<PjtLock.LockOperation> = []
  const upgrades: Array<UpgradeRecord> = []
  for (const [id, previous_] of Object.entries(previous.blueprints)) {
    const live = current[id]
    if (live === undefined) {
      removals.push(...previous_.operations)
    } else if (live.version !== previous_.version) {
      upgrades.push({ blueprintId: id, from: previous_.version, to: live.version })
    }
  }
  return { removals, upgrades }
}

const groupByBlueprint = (attributed: ReadonlyArray<AttributedOp>): ByBlueprint => {
  const out: Record<string, PjtLock.BlueprintLockEntry> = {}
  for (const { blueprintId, blueprintVersion, op } of attributed) {
    const entry = out[blueprintId] ?? { version: blueprintVersion, operations: [] }
    out[blueprintId] = {
      version: blueprintVersion,
      operations: [...entry.operations, toLockOp(op)],
    }
  }
  return out
}

const toLockOp = (op: ChangeSet.Operation): PjtLock.LockOperation => {
  switch (op.mode) {
    case "region": {
      // Only record commentSuffix when non-empty — empty-string suffixes are noise in the
      // lockfile, and absence decodes the same as empty per the schema.
      return op.commentSuffix !== undefined && op.commentSuffix !== ""
        ? {
            mode: "region",
            path: op.path,
            ownerId: op.ownerId,
            commentPrefix: op.commentPrefix,
            commentSuffix: op.commentSuffix,
          }
        : {
            mode: "region",
            path: op.path,
            ownerId: op.ownerId,
            commentPrefix: op.commentPrefix,
          }
    }
    case "merge": {
      return { mode: "merge", path: op.path, ownedKeys: op.ownedKeys }
    }
    case "owned": {
      return { mode: "owned", path: op.path, ownerId: op.ownerId }
    }
    case "seed": {
      return { mode: "seed", path: op.path, ownerId: op.ownerId }
    }
  }
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
      const array = byPath.get(op.path) ?? []
      array.push(op)
      byPath.set(op.path, array)
    }

    const files: Array<FilePlan> = []
    for (const [filePath, opsForPath] of byPath) {
      const first = opsForPath[0]!
      const mode = first.mode

      for (const op of opsForPath) {
        if (op.mode !== mode) {
          return yield* new Errors.PlanConflictOwned({
            id: "pjt.plan.conflict-owned",
            path: filePath,
            ownerA: first.ownerId,
            ownerB: op.ownerId,
            message: `Blueprints ${first.ownerId} (${mode}) and ${op.ownerId} (${op.mode}) both target ${filePath} with incompatible modes`,
          })
        }
      }

      switch (mode) {
        case "region": {
          const regionOps = opsForPath as ReadonlyArray<ChangeSet.RegionOp>
          const seen = new Set<string>()
          const regions: Array<{ ownerId: string; content: string }> = []
          let commentPrefix = regionOps[0]!.commentPrefix
          let commentSuffix = regionOps[0]!.commentSuffix ?? ""
          for (const op of regionOps) {
            if (seen.has(op.ownerId)) {
              return yield* new Errors.PlanConflictRegion({
                id: "pjt.plan.conflict-region",
                path: filePath,
                ownerA: op.ownerId,
                ownerB: op.ownerId,
                message: `Multiple blueprints share ownerId ${op.ownerId} for region in ${filePath}`,
              })
            }
            seen.add(op.ownerId)
            // Last-write-wins on prefix/suffix mismatch — in practice all blueprints targeting
            // the same file should use the same comment style. The lint preset surfaces the
            // mistake at authoring time.
            if (op.commentPrefix !== commentPrefix) commentPrefix = op.commentPrefix
            const opSuffix = op.commentSuffix ?? ""
            if (opSuffix !== commentSuffix) commentSuffix = opSuffix
            regions.push({ ownerId: op.ownerId, content: op.content })
          }
          files.push({ kind: "region", path: filePath, commentPrefix, commentSuffix, regions })
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
                return yield* new Errors.PlanConflictMerge({
                  id: "pjt.plan.conflict-merge",
                  path: filePath,
                  key,
                  ownerA: prior,
                  ownerB: op.ownerId,
                  message: `Blueprints ${prior} and ${op.ownerId} both claim key "${key}" in ${filePath}`,
                })
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
            return yield* new Errors.PlanConflictOwned({
              id: "pjt.plan.conflict-owned",
              path: filePath,
              ownerA: opsForPath[0]!.ownerId,
              ownerB: opsForPath[1]!.ownerId,
              message: `Multiple blueprints claim full ownership of ${filePath}`,
            })
          }
          const op = first
          files.push({ kind: "owned", path: filePath, ownerId: op.ownerId, content: op.content })
          break
        }
        case "seed": {
          if (opsForPath.length > 1) {
            return yield* new Errors.PlanConflictOwned({
              id: "pjt.plan.conflict-owned",
              path: filePath,
              ownerA: opsForPath[0]!.ownerId,
              ownerB: opsForPath[1]!.ownerId,
              message: `Multiple blueprints try to seed ${filePath}`,
            })
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
