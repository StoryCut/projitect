import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeInMemoryLayer } from "@projitect/test-kit"
import { ignoreSection, markdownSection } from "../src/sections.js"

/**
 * Unit tests for the `ignoreSection` and `markdownSection` SDK helpers. Both are thin wrappers
 * over `regionFile` — the contract under test is the comment-prefix/suffix pair they bake in,
 * the permissions they declare, and the round-trip through the existing region machinery.
 */

const planOps = (blueprint: ReturnType<typeof ignoreSection>) =>
  Effect.runPromise(
    blueprint.plan
      .pipe(Effect.provide(makeInMemoryLayer({})))
      .pipe(Effect.map((cs) => cs.operations)),
  )

describe("ignoreSection", () => {
  it("emits a single region op with prefix `#` and no suffix", async () => {
    const ops = await planOps(
      ignoreSection({
        id: "my-org:eslintignore:generated",
        version: "1.0.0",
        path: ".eslintignore",
        content: "dist/\nbuild/\n",
      }),
    )
    expect(ops).toHaveLength(1)
    const op = ops[0]
    if (op?._tag !== "Region") {
      throw new Error("expected region op")
    }
    expect(op.commentPrefix).toBe("#")
    expect(op.commentSuffix).toBeUndefined()
    expect(op.path).toBe(".eslintignore")
    expect(op.ownerId).toBe("my-org:eslintignore:generated")
    expect(op.content).toBe("dist/\nbuild/\n")
  })

  it("declares read + write permissions for the target path", () => {
    const blueprint = ignoreSection({
      id: "x",
      version: "1",
      path: ".prettierignore",
      content: "x\n",
    })
    const kinds = blueprint.permissions.map((p) => `${p.kind}:${"glob" in p ? p.glob : ""}`)
    expect(kinds).toContain("read:.prettierignore")
    expect(kinds).toContain("write:.prettierignore")
  })

  it("threads extraPermissions through to the resulting blueprint", () => {
    const blueprint = ignoreSection({
      id: "x",
      version: "1",
      path: ".dockerignore",
      content: "x\n",
      extraPermissions: [{ kind: "read", glob: "package.json" }],
    })
    expect(blueprint.permissions).toContainEqual({ kind: "read", glob: "package.json" })
  })

  it("threads description through when provided", () => {
    const blueprint = ignoreSection({
      id: "x",
      version: "1",
      description: "my notes here",
      path: ".gitignore",
      content: "x\n",
    })
    expect(blueprint.description).toBe("my notes here")
  })
})

describe("markdownSection", () => {
  it("emits a region op with HTML comment prefix and suffix", async () => {
    const ops = await planOps(
      markdownSection({
        id: "my-org:readme:badges",
        version: "1.0.0",
        path: "README.md",
        content: "![ci](https://example.com/badge.svg)\n",
      }),
    )
    expect(ops).toHaveLength(1)
    const op = ops[0]
    if (op?._tag !== "Region") {
      throw new Error("expected region op")
    }
    expect(op.commentPrefix).toBe("<!--")
    expect(op.commentSuffix).toBe(" -->")
    expect(op.path).toBe("README.md")
    expect(op.ownerId).toBe("my-org:readme:badges")
  })

  it("targets any MDX-ish path the author hands it", () => {
    const blueprint = markdownSection({
      id: "pjt:agents:rules",
      version: "1.0.0",
      path: "AGENTS.md",
      content: "Always run `pnpm check-all` before merging.\n",
    })
    expect(blueprint.id).toBe("pjt:agents:rules")
    expect(blueprint.permissions.map((p) => ("glob" in p ? p.glob : ""))).toContain("AGENTS.md")
  })

  it("supports MDX content with backtick / fenced-code blocks intact", async () => {
    const fence = "```ts\nconst x = 1\n```\n"
    const ops = await planOps(
      markdownSection({
        id: "my-org:docs:example",
        version: "1.0.0",
        path: "docs/example.mdx",
        content: fence,
      }),
    )
    const op = ops[0]
    if (op?._tag !== "Region") {
      throw new Error("expected region op")
    }
    expect(op.content).toBe(fence)
  })
})

describe("ignoreSection and markdownSection are interchangeable with regionFile", () => {
  it("two blueprints (ignoreSection vs markdownSection) on different paths don't conflict", async () => {
    // Validates that the helpers produce independent ops that target distinct files — i.e.
    // they're not accidentally sharing some hardcoded path internally.
    const a = await planOps(
      ignoreSection({ id: "a", version: "1", path: ".gitignore", content: "a\n" }),
    )
    const b = await planOps(
      markdownSection({ id: "b", version: "1", path: "README.md", content: "b\n" }),
    )
    expect(a[0]?._tag === "Region" && a[0].path).toBe(".gitignore")
    expect(b[0]?._tag === "Region" && b[0].path).toBe("README.md")
  })
})
