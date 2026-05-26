import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { findRegion, renderRegion, upsertRegion } from "../src/region.js"
import type { Errors } from "@projitect/core"

/**
 * Region-marker round-trip tests. `region.ts` is the load-bearing primitive for every region-mode
 * blueprint op (gitignore, .editorconfig, .pjt.ts pjt:projitect:imports, etc.). The applier's
 * region path, the remover's region path, and `pjt add`'s import-splicing all stack on top, so a
 * silent regression here breaks downstream behavior in confusing ways.
 *
 * The tests cover the four observable outcomes:
 *   1. Round-trip — render → splice → find → unchanged content
 *   2. Idempotence — calling upsert twice yields the same file
 *   3. Coexistence — multiple regions in one file find each other independently
 *   4. Error paths — missing end marker, duplicate start, off the happy path
 */

const runSync = <A>(effect: Effect.Effect<A, Errors.ProjitectError>): A => Effect.runSync(effect)

/**
 * Flip the error and success channels then run, returning the error value for assertion. Throws
 * (via `runSync`) if the effect actually succeeded — that's a test failure too, since we expected
 * an error.
 */
const runError = <E>(effect: Effect.Effect<unknown, E>): E => Effect.runSync(Effect.flip(effect))

describe("renderRegion", () => {
  it("wraps content in start/end markers with the given comment prefix", () => {
    const rendered = renderRegion({
      ownerId: "pjt:gitignore:macos",
      commentPrefix: "#",
      content: ".DS_Store\n",
    })
    expect(rendered).toBe(
      ["# pjt:gitignore:macos start", ".DS_Store", "# pjt:gitignore:macos end"].join("\n"),
    )
  })

  it("strips one trailing newline from content (markers re-add it on splice)", () => {
    const rendered = renderRegion({
      ownerId: "pjt:x",
      commentPrefix: "//",
      content: "line\n",
    })
    expect(rendered).toBe("// pjt:x start\nline\n// pjt:x end")
  })

  it("preserves multi-line content verbatim", () => {
    const rendered = renderRegion({
      ownerId: "pjt:x",
      commentPrefix: "#",
      content: "one\ntwo\nthree\n",
    })
    expect(rendered).toBe("# pjt:x start\none\ntwo\nthree\n# pjt:x end")
  })
})

describe("findRegion", () => {
  it("returns `absent` when no start marker is present", () => {
    const out = runSync(
      findRegion({
        fileContent: "no markers here\nanother line\n",
        ownerId: "pjt:missing",
        commentPrefix: "#",
        path: ".gitignore",
      }),
    )
    expect(out.kind).toBe("absent")
  })

  it("returns `found` with content between matched start/end markers", () => {
    const file = [
      "preamble",
      "# pjt:gitignore:macos start",
      ".DS_Store",
      ".AppleDouble",
      "# pjt:gitignore:macos end",
      "epilogue",
    ].join("\n")

    const out = runSync(
      findRegion({
        fileContent: file,
        ownerId: "pjt:gitignore:macos",
        commentPrefix: "#",
        path: ".gitignore",
      }),
    )
    expect(out).toEqual({
      kind: "found",
      startLine: 1,
      endLine: 4,
      content: ".DS_Store\n.AppleDouble",
    })
  })

  it("fails with pjt.region.missing-end when start has no matching end", () => {
    const error = runError(
      findRegion({
        fileContent: "# pjt:x start\norphan\nno end marker\n",
        ownerId: "pjt:x",
        commentPrefix: "#",
        path: "foo.txt",
      }),
    )
    expect(error._tag).toBe("RegionMissingEnd")
    expect(error.id).toBe("pjt.region.missing-end")
  })

  it("fails with pjt.region.duplicate when start appears twice", () => {
    const file = [
      "# pjt:x start",
      "first",
      "# pjt:x end",
      "# pjt:x start",
      "second",
      "# pjt:x end",
    ].join("\n")
    const error = runError(
      findRegion({
        fileContent: file,
        ownerId: "pjt:x",
        commentPrefix: "#",
        path: "foo.txt",
      }),
    )
    expect(error._tag).toBe("RegionDuplicate")
    expect(error.id).toBe("pjt.region.duplicate")
  })

  it("ignores trailing whitespace on marker lines", () => {
    const out = runSync(
      findRegion({
        fileContent: "# pjt:x start   \n.body\n# pjt:x end\t\n",
        ownerId: "pjt:x",
        commentPrefix: "#",
        path: ".gitignore",
      }),
    )
    expect(out.kind).toBe("found")
  })

  it("uses the comment prefix verbatim — `//` markers don't match `#` ones", () => {
    const out = runSync(
      findRegion({
        fileContent: "# pjt:x start\nbody\n# pjt:x end\n",
        ownerId: "pjt:x",
        commentPrefix: "//",
        path: "foo.ts",
      }),
    )
    expect(out.kind).toBe("absent")
  })

  it("isolates regions with distinct owner ids", () => {
    const file = [
      "# pjt:a start",
      "aaa",
      "# pjt:a end",
      "# pjt:b start",
      "bbb",
      "# pjt:b end",
    ].join("\n")
    const a = runSync(
      findRegion({ fileContent: file, ownerId: "pjt:a", commentPrefix: "#", path: "x" }),
    )
    const b = runSync(
      findRegion({ fileContent: file, ownerId: "pjt:b", commentPrefix: "#", path: "x" }),
    )
    expect(a.kind === "found" && a.content).toBe("aaa")
    expect(b.kind === "found" && b.content).toBe("bbb")
  })
})

describe("upsertRegion", () => {
  const rendered = renderRegion({
    ownerId: "pjt:x",
    commentPrefix: "#",
    content: ".DS_Store\n",
  })

  it("appends to an empty file with a trailing newline", () => {
    const out = upsertRegion({
      fileContent: "",
      existing: { kind: "absent" },
      rendered,
    })
    expect(out).toBe(`${rendered}\n`)
  })

  it("appends to a file without trailing newline by adding one separator", () => {
    const out = upsertRegion({
      fileContent: "existing line",
      existing: { kind: "absent" },
      rendered,
    })
    expect(out).toBe(`existing line\n${rendered}\n`)
  })

  it("appends to a file with trailing newline without doubling it", () => {
    const out = upsertRegion({
      fileContent: "existing\n",
      existing: { kind: "absent" },
      rendered,
    })
    expect(out).toBe(`existing\n${rendered}\n`)
  })

  it("replaces an existing region in place, preserving surrounding lines", () => {
    const file = ["before", "# pjt:x start", "stale content", "# pjt:x end", "after"].join("\n")
    const existing = runSync(
      findRegion({
        fileContent: file,
        ownerId: "pjt:x",
        commentPrefix: "#",
        path: "f",
      }),
    )
    const out = upsertRegion({ fileContent: file, existing, rendered })
    expect(out).toBe(["before", rendered, "after"].join("\n"))
  })

  it("is idempotent: calling upsert twice yields the same content", () => {
    const file = "first line\n"
    const once = upsertRegion({
      fileContent: file,
      existing: { kind: "absent" },
      rendered,
    })
    const lookup = runSync(
      findRegion({
        fileContent: once,
        ownerId: "pjt:x",
        commentPrefix: "#",
        path: "f",
      }),
    )
    const twice = upsertRegion({ fileContent: once, existing: lookup, rendered })
    expect(twice).toBe(once)
  })
})
