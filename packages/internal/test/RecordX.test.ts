import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { RecordX } from "../src/index.js"

describe("RecordX.collectBy", () => {
  it("collects an iterable into a record keyed by identify", () => {
    const result = RecordX.collectBy(
      [
        { id: "a", n: 1 },
        { id: "b", n: 2 },
      ],
      (x) => x.id,
    )
    expect(result).toEqual({ a: { id: "a", n: 1 }, b: { id: "b", n: 2 } })
  })

  it("last value wins on key collision", () => {
    const result = RecordX.collectBy(
      [
        { id: "a", n: 1 },
        { id: "a", n: 3 },
      ],
      (x) => x.id,
    )
    expect(result).toEqual({ a: { id: "a", n: 3 } })
  })
})

describe("RecordX.deepMerge", () => {
  it("merges plain objects recursively", () => {
    expect(RecordX.deepMerge({ a: { x: 1 }, b: 2 }, { a: { y: 3 }, c: 4 })).toEqual({
      a: { x: 1, y: 3 },
      b: 2,
      c: 4,
    })
  })

  it("replaces arrays and primitives wholesale with b", () => {
    expect(RecordX.deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
    expect(RecordX.deepMerge(1, 2)).toBe(2)
    expect(RecordX.deepMerge({ a: 1 }, "x")).toBe("x")
  })

  it("does not mutate either input", () => {
    const a = { nested: { x: 1 } }
    const b = { nested: { y: 2 } }
    RecordX.deepMerge(a, b)
    expect(a).toEqual({ nested: { x: 1 } })
    expect(b).toEqual({ nested: { y: 2 } })
  })
})

describe("RecordX.canonicalize", () => {
  it("recursively sorts object keys", () => {
    expect(JSON.stringify(RecordX.canonicalize({ b: 1, a: { d: 1, c: 2 } }))).toBe(
      JSON.stringify({ a: { c: 2, d: 1 }, b: 1 }),
    )
  })

  it("preserves array order", () => {
    expect(RecordX.canonicalize([3, 1, 2])).toEqual([3, 1, 2])
  })

  it("passes primitives through", () => {
    expect(RecordX.canonicalize("x")).toBe("x")
    expect(RecordX.canonicalize(5)).toBe(5)
  })
})

describe("RecordX.deleteByPath", () => {
  it("deletes a nested key and prunes parents that become empty", () => {
    const result = RecordX.deleteByPath({ a: { b: 1 } }, ["a", "b"])
    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({})
  })

  it("keeps parents that still have other keys", () => {
    const result = RecordX.deleteByPath({ a: { b: 1, c: 2 } }, ["a", "b"])
    expect(Option.getOrThrow(result)).toEqual({ a: { c: 2 } })
  })

  it("returns None when the path is absent", () => {
    expect(Option.isNone(RecordX.deleteByPath({ a: 1 }, ["b"]))).toBe(true)
    expect(Option.isNone(RecordX.deleteByPath({ a: 1 }, ["a", "b"]))).toBe(true)
  })

  it("does not mutate the input", () => {
    const input = { a: { b: 1, c: 2 } }
    RecordX.deleteByPath(input, ["a", "b"])
    expect(input).toEqual({ a: { b: 1, c: 2 } })
  })
})

describe("RecordX.modifyIfExists", () => {
  const record: Record<string, number> = { a: 1 }

  it("modifies an existing key", () => {
    expect(RecordX.modifyIfExists(record, "a", (n) => n + 1)).toEqual({ a: 2 })
  })

  it("leaves the record unchanged when the key is absent", () => {
    expect(RecordX.modifyIfExists(record, "b", (n) => n + 1)).toEqual({ a: 1 })
  })
})
