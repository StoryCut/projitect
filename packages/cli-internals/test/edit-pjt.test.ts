import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import path from "node:path"
import { splice } from "../src/edit-pjt.js"

/**
 * `edit-pjt.ts` powers `pjt add` — it splices a new import line and one or more blueprint call
 * lines into `.pjt.ts` using the convention markers (`// pjt:imports start/end` and
 * `// pjt:blueprints start/end`). A regression here either corrupts the user's file or fails
 * silently and prints "Added." while doing nothing.
 *
 * Coverage:
 *  - new import + new calls splice between the markers, indented to match the seeded template
 *  - duplicate import is deduped (idempotent re-add of the same package)
 *  - empty call array doesn't touch the blueprints block (used when --section is omitted)
 *  - missing imports markers → pjt.add.markers-missing
 *  - missing blueprints markers → pjt.add.markers-missing
 *  - inverted markers (end before start) treated as missing
 */

const ROOT = path.join(os.tmpdir(), "projitect-test-edit-pjt")

let cwd: string

beforeEach(async () => {
  cwd = await fs.mkdtemp(`${ROOT}-`)
})

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true })
})

const writePjtTs = (content: string) => fs.writeFile(path.join(cwd, ".pjt.ts"), content, "utf8")

const readPjtTs = () => fs.readFile(path.join(cwd, ".pjt.ts"), "utf8")

const SEEDED_TEMPLATE = [
  "// pjt:imports start",
  "// pjt:imports end",
  "",
  "export default pjt({",
  "  blueprints: [",
  "    // pjt:blueprints start",
  "    // pjt:blueprints end",
  "  ],",
  "})",
  "",
].join("\n")

const runError = <E>(effect: Effect.Effect<unknown, E>): Promise<E> =>
  Effect.runPromise(Effect.flip(effect))

describe("splice — happy paths", () => {
  it("adds a new import and call line to a seeded template", async () => {
    await writePjtTs(SEEDED_TEMPLATE)

    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import { gitignores } from "@projitect/blueprint-gitignore"',
        callLines: ["gitignores.macOs()"],
      }),
    )

    const after = await readPjtTs()
    expect(after).toContain(
      '// pjt:imports start\nimport { gitignores } from "@projitect/blueprint-gitignore"\n// pjt:imports end',
    )
    expect(after).toContain(
      "// pjt:blueprints start\n    gitignores.macOs()\n    // pjt:blueprints end",
    )
  })

  it("dedupes a repeated import — calling splice twice with the same import keeps one copy", async () => {
    await writePjtTs(SEEDED_TEMPLATE)

    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import { x } from "y"',
        callLines: ["x()"],
      }),
    )
    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import { x } from "y"',
        callLines: [],
      }),
    )

    const after = await readPjtTs()
    const importCount = (after.match(/import \{ x \} from "y"/g) ?? []).length
    expect(importCount).toBe(1)
  })

  it("indents each call line to 4 spaces, matching the seeded template", async () => {
    await writePjtTs(SEEDED_TEMPLATE)

    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import { a, b } from "x"',
        callLines: ["a()", "b()"],
      }),
    )

    const after = await readPjtTs()
    expect(after).toContain("    a()\n    b()\n    // pjt:blueprints end")
  })

  it("does not touch the blueprints block when callLines is empty", async () => {
    await writePjtTs(SEEDED_TEMPLATE)

    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import "side-effect"',
        callLines: [],
      }),
    )

    const after = await readPjtTs()
    // import got added
    expect(after).toContain('import "side-effect"')
    // but the blueprints block is still empty
    expect(after).toContain("// pjt:blueprints start\n    // pjt:blueprints end")
  })

  it("accepts call lines with leading whitespace and re-indents them to 4 spaces", async () => {
    await writePjtTs(SEEDED_TEMPLATE)

    await Effect.runPromise(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import { x } from "y"',
        callLines: ["        x()"], // 8 leading spaces, will be stripped + re-indented to 4
      }),
    )

    const after = await readPjtTs()
    expect(after).toContain("    x()\n")
    expect(after).not.toContain("        x()\n")
  })
})

describe("splice — error paths", () => {
  it("fails with pjt.add.markers-missing when imports markers are absent", async () => {
    await writePjtTs(
      [
        "export default pjt({",
        "  blueprints: [",
        "    // pjt:blueprints start",
        "    // pjt:blueprints end",
        "  ],",
        "})",
        "",
      ].join("\n"),
    )
    const err = await runError(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import "x"',
        callLines: ["x()"],
      }),
    )
    expect(err._tag).toBe("AddMarkersMissing")
    expect(err.id).toBe("pjt.add.markers-missing")
    expect(err.missingMarker).toContain("pjt:imports")
  })

  it("fails with pjt.add.markers-missing when blueprints markers are absent", async () => {
    await writePjtTs(
      [
        "// pjt:imports start",
        "// pjt:imports end",
        "",
        "export default pjt({ blueprints: [] })",
        "",
      ].join("\n"),
    )
    const err = await runError(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import "x"',
        callLines: ["x()"],
      }),
    )
    expect(err._tag).toBe("AddMarkersMissing")
    expect(err.missingMarker).toContain("pjt:blueprints")
  })

  it("treats inverted marker order (end before start) as missing", async () => {
    await writePjtTs(
      [
        "// pjt:imports end", // intentionally inverted
        "// pjt:imports start",
        "",
        "export default pjt({",
        "  blueprints: [",
        "    // pjt:blueprints start",
        "    // pjt:blueprints end",
        "  ],",
        "})",
        "",
      ].join("\n"),
    )
    const err = await runError(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import "x"',
        callLines: [],
      }),
    )
    expect(err._tag).toBe("AddMarkersMissing")
  })

  it("fails with pjt.fs.read-failed when the blueprint file doesn't exist", async () => {
    const err = await runError(
      splice({
        projectRoot: cwd,
        blueprintFile: ".pjt.ts",
        importLine: 'import "x"',
        callLines: ["x()"],
      }),
    )
    expect(err._tag).toBe("FsReadFailed")
  })
})
