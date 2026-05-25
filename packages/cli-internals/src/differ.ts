import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Effect } from "effect"
import type {
  FilePlan,
  ProjectPlan,
  RegionPlanFile,
  MergePlanFile,
  OwnedPlanFile,
  SeedPlanFile,
} from "./plan.js"
import { findRegion, renderRegion } from "./region.js"
import type { Errors } from "@projitect/core"

export interface FileDiff {
  readonly path: string
  /** "create" — file absent, will be created; "modify" — exists but content drifts; "ok" — in sync. */
  readonly status: "create" | "modify" | "ok"
  readonly summary: string
}

export interface PlanDiff {
  readonly files: ReadonlyArray<FileDiff>
  readonly hasDrift: boolean
}

const readIfExists = (full: string): Promise<string | null> =>
  fs.readFile(full, "utf8").then(
    (s) => s,
    () => null,
  )

/**
 * Compare each file in the plan against disk. Returns a structured diff suitable for either
 * human rendering (`renderPlanDiff`) or machine consumption (`--json`).
 */
export const diffPlan = (params: {
  readonly plan: ProjectPlan
  readonly projectRoot: string
}): Effect.Effect<PlanDiff, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { plan, projectRoot } = params
  return Effect.gen(function* () {
    const files: Array<FileDiff> = []
    let hasDrift = false

    for (const file of plan.files) {
      const full = path.resolve(projectRoot, file.path)
      const current = yield* Effect.promise(() => readIfExists(full))
      const diff = yield* diffFile({ file, current })
      if (diff.status !== "ok") hasDrift = true
      files.push(diff)
    }

    return { files, hasDrift }
  })
}

const diffFile = (params: {
  readonly file: FilePlan
  readonly current: string | null
}): Effect.Effect<FileDiff, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { file, current } = params

  switch (file.kind) {
    case "region":
      return diffRegion(file, current)
    case "merge":
      return Effect.succeed(diffMerge(file, current))
    case "owned":
      return Effect.succeed(diffOwned(file, current))
    case "seed":
      return Effect.succeed(diffSeed(file, current))
  }
}

const diffRegion = (
  file: RegionPlanFile,
  current: string | null,
): Effect.Effect<FileDiff, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.gen(function* () {
    if (current === null) {
      return {
        path: file.path,
        status: "create" as const,
        summary: `+ create ${file.path} (${file.regions.length} region${file.regions.length === 1 ? "" : "s"})`,
      }
    }
    const drifted: Array<string> = []
    for (const region of file.regions) {
      const found = yield* findRegion({
        fileContent: current,
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        path: file.path,
      })
      const expected = region.content.trimEnd()
      if (found.kind === "absent") {
        drifted.push(`missing region ${region.ownerId}`)
      } else if (found.content.trimEnd() !== expected) {
        drifted.push(`region ${region.ownerId} content drift`)
      }
    }
    if (drifted.length === 0) {
      return { path: file.path, status: "ok" as const, summary: `  ok ${file.path}` }
    }
    return {
      path: file.path,
      status: "modify" as const,
      summary: `~ modify ${file.path} — ${drifted.join(", ")}`,
    }
  })

const diffMerge = (file: MergePlanFile, current: string | null): FileDiff => {
  if (current === null) {
    return {
      path: file.path,
      status: "create",
      summary: `+ create ${file.path}`,
    }
  }
  try {
    const parsed = JSON.parse(current) as unknown
    const target = mergeIntoExisting(parsed, file.value)
    if (canonicalJson(parsed) === canonicalJson(target)) {
      return { path: file.path, status: "ok", summary: `  ok ${file.path}` }
    }
    return {
      path: file.path,
      status: "modify",
      summary: `~ modify ${file.path} (JSON merge)`,
    }
  } catch {
    return {
      path: file.path,
      status: "modify",
      summary: `~ modify ${file.path} (unparseable JSON)`,
    }
  }
}

const diffOwned = (file: OwnedPlanFile, current: string | null): FileDiff => {
  if (current === null) {
    return { path: file.path, status: "create", summary: `+ create ${file.path}` }
  }
  if (current === file.content) {
    return { path: file.path, status: "ok", summary: `  ok ${file.path}` }
  }
  return { path: file.path, status: "modify", summary: `~ modify ${file.path}` }
}

const diffSeed = (file: SeedPlanFile, current: string | null): FileDiff => {
  if (current === null) {
    return { path: file.path, status: "create", summary: `+ create ${file.path} (seed)` }
  }
  return { path: file.path, status: "ok", summary: `  ok ${file.path} (seed, never enforced)` }
}

// ---------------------------------------------------------------------------
// Helpers shared with applier
// ---------------------------------------------------------------------------

export const mergeIntoExisting = (existing: unknown, intent: unknown): unknown => {
  if (!isObj(existing)) return intent
  if (!isObj(intent)) return intent
  const out: Record<string, unknown> = { ...existing }
  for (const [k, v] of Object.entries(intent)) {
    out[k] = k in existing ? mergeIntoExisting(existing[k], v) : v
  }
  return out
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const canonicalJson = (v: unknown): string => JSON.stringify(sortKeys(v))

const sortKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (isObj(v)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      out[k] = sortKeys(v[k])
    }
    return out
  }
  return v
}

// ---------------------------------------------------------------------------
// Render a diff for the terminal
// ---------------------------------------------------------------------------

export const renderPlanDiff = (diff: PlanDiff): string => {
  if (!diff.hasDrift) return "Project is in sync with blueprints. No changes needed."
  const lines = diff.files.map((f) => f.summary)
  return lines.join("\n")
}

// suppress unused renderRegion import — applier consumes it via re-export
void renderRegion
