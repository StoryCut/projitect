import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { blueprintIds, readLockfile, writeLockfile } from "../src/lockfile.js"
import type { PjtLock } from "@projitect/core"

/**
 * Lockfile round-trip + error-path tests.
 *
 * `.pjt.lock` is the source of truth for "what was previously applied" — without a correct
 * round-trip, drift detection misreports and the orphan-removal pipeline can't tell which
 * blueprints have left the tree. So the round-trip is the load-bearing assertion here; the rest
 * of the tests are error paths (`pjt.lock.parse-failed`, `pjt.lock.version-mismatch`) that the
 * v0.1 plan said had to fire on the right inputs.
 */

const ROOT = path.join(os.tmpdir(), "projitect-test-lockfile")

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const lockfile = (overrides: Partial<PjtLock.PjtLock> = {}): PjtLock.PjtLock => ({
  version: 1,
  blueprints: {
    "pjt:a": {
      version: "1.0.0",
      operations: [{ mode: "region", path: ".gitignore", ownerId: "pjt:a", commentPrefix: "#" }],
    },
    "pjt:b": {
      version: "2.0.0",
      operations: [
        { mode: "merge", path: "package.json", ownedKeys: ["scripts.test"] },
        { mode: "owned", path: "generated.ts", ownerId: "pjt:b" },
      ],
    },
  },
  ...overrides,
})

const runError = <E>(effect: Effect.Effect<unknown, E>): Promise<E> =>
  Effect.runPromise(Effect.flip(effect))

describe("readLockfile / writeLockfile round-trip", () => {
  it("returns null when no lockfile exists (fresh project)", async () => {
    const out = await Effect.runPromise(readLockfile({ projectRoot: cwd }))
    expect(out).toBeNull()
  })

  it("writes a lockfile and reads it back unchanged", async () => {
    const original = lockfile()
    await Effect.runPromise(writeLockfile({ projectRoot: cwd, lock: original }))
    const out = await Effect.runPromise(readLockfile({ projectRoot: cwd }))
    expect(out).toEqual(original)
  })

  it("writes the lockfile with trailing newline and 2-space indent", async () => {
    await Effect.runPromise(writeLockfile({ projectRoot: cwd, lock: lockfile() }))
    const raw = await fs.readFile(path.join(cwd, ".pjt.lock"), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(raw).toContain('  "version": 1')
  })

  it("preserves a region operation's commentSuffix when set", async () => {
    const original: PjtLock.PjtLock = {
      version: 1,
      blueprints: {
        "pjt:md": {
          version: "1",
          operations: [
            {
              mode: "region",
              path: "README.md",
              ownerId: "pjt:md",
              commentPrefix: "<!--",
              commentSuffix: " -->",
            },
          ],
        },
      },
    }
    await Effect.runPromise(writeLockfile({ projectRoot: cwd, lock: original }))
    const out = await Effect.runPromise(readLockfile({ projectRoot: cwd }))
    expect(out).toEqual(original)
  })

  it("decodes an older lockfile without commentSuffix (backwards compat)", async () => {
    // Hand-write a lockfile shaped like a pre-suffix version.
    const raw = {
      version: 1,
      blueprints: {
        "pjt:old": {
          version: "1",
          operations: [
            {
              mode: "region",
              path: ".gitignore",
              ownerId: "pjt:old",
              commentPrefix: "#",
              // no commentSuffix field
            },
          ],
        },
      },
    }
    await fs.writeFile(path.join(cwd, ".pjt.lock"), `${JSON.stringify(raw, null, 2)}\n`, "utf8")
    const out = await Effect.runPromise(readLockfile({ projectRoot: cwd }))
    expect(out).not.toBeNull()
    expect(out?.blueprints["pjt:old"]?.operations[0]).toEqual({
      mode: "region",
      path: ".gitignore",
      ownerId: "pjt:old",
      commentPrefix: "#",
    })
  })

  it("preserves operations across all four ownership modes", async () => {
    const original: PjtLock.PjtLock = {
      version: 1,
      blueprints: {
        "pjt:r": {
          version: "1",
          operations: [
            { mode: "region", path: ".gitignore", ownerId: "pjt:r", commentPrefix: "#" },
          ],
        },
        "pjt:m": {
          version: "1",
          operations: [{ mode: "merge", path: "package.json", ownedKeys: ["a", "b.c"] }],
        },
        "pjt:o": {
          version: "1",
          operations: [{ mode: "owned", path: "x.ts", ownerId: "pjt:o" }],
        },
        "pjt:s": {
          version: "1",
          operations: [{ mode: "seed", path: ".pjt.ts", ownerId: "pjt:s" }],
        },
      },
    }
    await Effect.runPromise(writeLockfile({ projectRoot: cwd, lock: original }))
    const out = await Effect.runPromise(readLockfile({ projectRoot: cwd }))
    expect(out).toEqual(original)
  })
})

describe("readLockfile — error paths", () => {
  it("fails with pjt.lock.parse-failed on corrupted JSON", async () => {
    await fs.writeFile(path.join(cwd, ".pjt.lock"), "{ not json", "utf8")
    const err = await runError(readLockfile({ projectRoot: cwd }))
    expect(err._tag).toBe("LockParseFailed")
    expect(err.id).toBe("pjt.lock.parse-failed")
  })

  it("fails with pjt.lock.parse-failed when the JSON doesn't match the schema", async () => {
    await fs.writeFile(
      path.join(cwd, ".pjt.lock"),
      JSON.stringify({ version: 1, blueprints: { x: { version: "1" /* missing operations */ } } }),
      "utf8",
    )
    const err = await runError(readLockfile({ projectRoot: cwd }))
    expect(err._tag).toBe("LockParseFailed")
  })

  it("fails with pjt.lock.version-mismatch when written by a newer projitect", async () => {
    await fs.writeFile(
      path.join(cwd, ".pjt.lock"),
      JSON.stringify({ version: 999, blueprints: {} }),
      "utf8",
    )
    const err = await runError(readLockfile({ projectRoot: cwd }))
    expect(err._tag).toBe("LockVersionMismatch")
    expect(err.id).toBe("pjt.lock.version-mismatch")
  })
})

describe("blueprintIds", () => {
  it("returns an empty set on null input (no lockfile yet)", () => {
    expect(blueprintIds(null).size).toBe(0)
  })

  it("collects every top-level blueprint id from the lockfile", () => {
    const ids = blueprintIds(lockfile())
    expect([...ids].toSorted()).toEqual(["pjt:a", "pjt:b"])
  })
})
