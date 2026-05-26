import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import * as os from "node:os"
import { directory } from "@projitect/blueprint"
import type { Blueprint as _Blueprint, ChangeSet } from "@projitect/core"
import type { PjtLock } from "@projitect/core"
import { buildPlan, diffLockfile, type ByBlueprint } from "../src/plan.js"

/**
 * `plan.ts` is the engine room: it walks the blueprint tree, runs each blueprint's plan Effect to
 * collect ChangeSets, reduces them with conflict detection, and produces both the project plan
 * and the per-blueprint lockfile entries.
 *
 * These tests construct blueprints whose `plan` Effect just returns operations directly — no FS
 * access — so we don't need real disk for unit-testing the reducer. `projectRoot` points to
 * `os.tmpdir()` because `makeRealLayer` still gets instantiated even when unused; the path needs
 * to exist.
 *
 * Coverage targets:
 *  - reduceOps: region merge, merge deep-merge, owned single-owner, seed single-owner
 *  - conflict detection: same path different modes, duplicate region owner, duplicate merge key,
 *    multiple owners on `owned` / `seed`
 *  - groupByBlueprint: per-id versioning, multiple ops per blueprint
 *  - directory() rebasing: prefix flows into op paths
 *  - diffLockfile: removals on blueprint disappearance, upgrades on version bump, no-op on first
 *    run (previous === null)
 */

const ROOT = os.tmpdir()

const makeBlueprint = (params: {
  id: string
  version?: string
  ops: ReadonlyArray<ChangeSet.Operation>
}): _Blueprint.Blueprint => ({
  id: params.id,
  version: params.version ?? "1.0.0",
  permissions: [],
  plan: Effect.succeed({ operations: params.ops }),
})

const runError = <E>(effect: Effect.Effect<unknown, E>): E => Effect.runSync(Effect.flip(effect))

describe("buildPlan — happy paths", () => {
  it("collects a single region op into a region FilePlan", async () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:a",
            path: ".gitignore",
            commentPrefix: "#",
            content: ".DS_Store\n",
          },
        ],
      }),
    ]
    const { plan, byBlueprint } = await Effect.runPromise(buildPlan({ tree, projectRoot: ROOT }))
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0]).toMatchObject({
      kind: "region",
      path: ".gitignore",
      commentPrefix: "#",
      regions: [{ ownerId: "pjt:a", content: ".DS_Store\n" }],
    })
    expect(byBlueprint).toEqual({
      "pjt:a": {
        version: "1.0.0",
        operations: [{ mode: "region", path: ".gitignore", ownerId: "pjt:a", commentPrefix: "#" }],
      },
    })
  })

  it("co-locates two regions from different blueprints on the same file", async () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:a",
            path: ".gitignore",
            commentPrefix: "#",
            content: "a\n",
          },
        ],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:b",
            path: ".gitignore",
            commentPrefix: "#",
            content: "b\n",
          },
        ],
      }),
    ]
    const { plan } = await Effect.runPromise(buildPlan({ tree, projectRoot: ROOT }))
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0]).toMatchObject({
      kind: "region",
      regions: [
        { ownerId: "pjt:a", content: "a\n" },
        { ownerId: "pjt:b", content: "b\n" },
      ],
    })
  })

  it("deep-merges JSON values from two merge ops on the same path", async () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [
          {
            mode: "merge",
            ownerId: "pjt:a",
            path: "package.json",
            ownedKeys: ["scripts.a"],
            value: { scripts: { a: "true" }, name: "project" },
          },
        ],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [
          {
            mode: "merge",
            ownerId: "pjt:b",
            path: "package.json",
            ownedKeys: ["scripts.b"],
            value: { scripts: { b: "true" } },
          },
        ],
      }),
    ]
    const { plan } = await Effect.runPromise(buildPlan({ tree, projectRoot: ROOT }))
    expect(plan.files).toHaveLength(1)
    const file = plan.files[0]
    if (file?.kind !== "merge")
      throw new Error(`expected merge FilePlan, got ${String(file?.kind)}`)
    expect(file.value).toEqual({
      scripts: { a: "true", b: "true" },
      name: "project",
    })
    expect(Object.fromEntries(file.ownership)).toEqual({
      "scripts.a": "pjt:a",
      "scripts.b": "pjt:b",
    })
  })

  it("emits a single byBlueprint entry collecting multi-op blueprints", async () => {
    const tree = [
      makeBlueprint({
        id: "pjt:multi",
        version: "2.3.4",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:multi",
            path: ".gitignore",
            commentPrefix: "#",
            content: "x\n",
          },
          {
            mode: "merge",
            ownerId: "pjt:multi",
            path: "package.json",
            ownedKeys: ["scripts.x"],
            value: { scripts: { x: "true" } },
          },
        ],
      }),
    ]
    const { byBlueprint } = await Effect.runPromise(buildPlan({ tree, projectRoot: ROOT }))
    expect(byBlueprint["pjt:multi"]).toEqual({
      version: "2.3.4",
      operations: [
        { mode: "region", path: ".gitignore", ownerId: "pjt:multi", commentPrefix: "#" },
        { mode: "merge", path: "package.json", ownedKeys: ["scripts.x"] },
      ],
    })
  })

  it("rebases child paths inside a directory() wrapper", async () => {
    const tree = [
      directory("apps", [
        directory("web", [
          makeBlueprint({
            id: "pjt:scoped",
            ops: [{ mode: "owned", ownerId: "pjt:scoped", path: "tsconfig.json", content: "{}\n" }],
          }),
        ]),
      ]),
    ]
    const { plan, byBlueprint } = await Effect.runPromise(buildPlan({ tree, projectRoot: ROOT }))
    expect(plan.files[0]).toMatchObject({
      kind: "owned",
      path: "apps/web/tsconfig.json",
    })
    // The lockfile entry must also carry the rebased path; otherwise removals miss the file.
    expect(byBlueprint["pjt:scoped"]?.operations[0]).toEqual({
      mode: "owned",
      path: "apps/web/tsconfig.json",
      ownerId: "pjt:scoped",
    })
  })
})

describe("buildPlan — conflict detection", () => {
  it("rejects two different modes on the same path", () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [{ mode: "owned", ownerId: "pjt:a", path: "x.txt", content: "a" }],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:b",
            path: "x.txt",
            commentPrefix: "#",
            content: "b",
          },
        ],
      }),
    ]
    const err = runError(buildPlan({ tree, projectRoot: ROOT }))
    expect(err._tag).toBe("PlanConflictOwned")
  })

  it("rejects two regions with identical ownerId on the same file", () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:dup",
            path: ".gitignore",
            commentPrefix: "#",
            content: "x\n",
          },
        ],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [
          {
            mode: "region",
            ownerId: "pjt:dup",
            path: ".gitignore",
            commentPrefix: "#",
            content: "y\n",
          },
        ],
      }),
    ]
    const err = runError(buildPlan({ tree, projectRoot: ROOT }))
    expect(err._tag).toBe("PlanConflictRegion")
  })

  it("rejects two merge ops that both claim the same dotted key", () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [
          {
            mode: "merge",
            ownerId: "pjt:a",
            path: "package.json",
            ownedKeys: ["scripts.test"],
            value: { scripts: { test: "vitest" } },
          },
        ],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [
          {
            mode: "merge",
            ownerId: "pjt:b",
            path: "package.json",
            ownedKeys: ["scripts.test"],
            value: { scripts: { test: "jest" } },
          },
        ],
      }),
    ]
    const err = runError(buildPlan({ tree, projectRoot: ROOT }))
    expect(err._tag).toBe("PlanConflictMerge")
  })

  it("rejects two `owned` blueprints on the same file", () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [{ mode: "owned", ownerId: "pjt:a", path: "f.txt", content: "a" }],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [{ mode: "owned", ownerId: "pjt:b", path: "f.txt", content: "b" }],
      }),
    ]
    const err = runError(buildPlan({ tree, projectRoot: ROOT }))
    expect(err._tag).toBe("PlanConflictOwned")
  })

  it("rejects two `seed` blueprints on the same file", () => {
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [{ mode: "seed", ownerId: "pjt:a", path: ".pjt.ts", content: "a" }],
      }),
      makeBlueprint({
        id: "pjt:b",
        ops: [{ mode: "seed", ownerId: "pjt:b", path: ".pjt.ts", content: "b" }],
      }),
    ]
    const err = runError(buildPlan({ tree, projectRoot: ROOT }))
    expect(err._tag).toBe("PlanConflictOwned")
  })

  it("permits the same blueprint claiming the same merge key twice (idempotent self-claim)", async () => {
    // Self-claim should NOT be a conflict — same ownerId across both ops on the same key.
    const tree = [
      makeBlueprint({
        id: "pjt:a",
        ops: [
          {
            mode: "merge",
            ownerId: "pjt:a",
            path: "package.json",
            ownedKeys: ["scripts.test"],
            value: { scripts: { test: "first" } },
          },
          {
            mode: "merge",
            ownerId: "pjt:a",
            path: "package.json",
            ownedKeys: ["scripts.test"],
            value: { scripts: { test: "second" } },
          },
        ],
      }),
    ]
    const { plan } = await Effect.runPromise(buildPlan({ tree, projectRoot: ROOT }))
    // Last-write wins on deep-merge for self-claims.
    expect(plan.files[0]).toMatchObject({
      kind: "merge",
      value: { scripts: { test: "second" } },
    })
  })
})

describe("diffLockfile", () => {
  const lockOf = (entries: Record<string, PjtLock.BlueprintLockEntry>): PjtLock.PjtLock => ({
    version: 1,
    blueprints: entries,
  })

  it("returns nothing when previous lockfile is null (first run)", () => {
    const out = diffLockfile({
      previous: null,
      current: { "pjt:a": { version: "1.0.0", operations: [] } },
    })
    expect(out).toEqual({ removals: [], upgrades: [] })
  })

  it("emits removals for blueprints absent from the current set", () => {
    const previous = lockOf({
      "pjt:a": {
        version: "1.0.0",
        operations: [{ mode: "region", path: ".gitignore", ownerId: "pjt:a", commentPrefix: "#" }],
      },
      "pjt:b": {
        version: "1.0.0",
        operations: [{ mode: "owned", path: "x.ts", ownerId: "pjt:b" }],
      },
    })
    const current: ByBlueprint = {
      "pjt:a": {
        version: "1.0.0",
        operations: [{ mode: "region", path: ".gitignore", ownerId: "pjt:a", commentPrefix: "#" }],
      },
    }
    const out = diffLockfile({ previous, current })
    expect(out.removals).toEqual([{ mode: "owned", path: "x.ts", ownerId: "pjt:b" }])
    expect(out.upgrades).toEqual([])
  })

  it("emits an upgrade record when the same blueprint's version changes", () => {
    const previous = lockOf({
      "pjt:a": {
        version: "0.0.0",
        operations: [{ mode: "owned", path: "x.ts", ownerId: "pjt:a" }],
      },
    })
    const current: ByBlueprint = {
      "pjt:a": {
        version: "1.0.0",
        operations: [{ mode: "owned", path: "x.ts", ownerId: "pjt:a" }],
      },
    }
    const out = diffLockfile({ previous, current })
    expect(out.upgrades).toEqual([{ blueprintId: "pjt:a", from: "0.0.0", to: "1.0.0" }])
    expect(out.removals).toEqual([])
  })

  it("reports removals + upgrades together when both apply in one run", () => {
    const previous = lockOf({
      "pjt:left": {
        version: "1.0.0",
        operations: [{ mode: "owned", path: "left.ts", ownerId: "pjt:left" }],
      },
      "pjt:stay": {
        version: "0.9.0",
        operations: [{ mode: "owned", path: "stay.ts", ownerId: "pjt:stay" }],
      },
    })
    const current: ByBlueprint = {
      "pjt:stay": {
        version: "1.0.0",
        operations: [{ mode: "owned", path: "stay.ts", ownerId: "pjt:stay" }],
      },
    }
    const out = diffLockfile({ previous, current })
    expect(out.removals).toEqual([{ mode: "owned", path: "left.ts", ownerId: "pjt:left" }])
    expect(out.upgrades).toEqual([{ blueprintId: "pjt:stay", from: "0.9.0", to: "1.0.0" }])
  })
})
