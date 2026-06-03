import { describe, expect, it } from "vitest"
import { StructX } from "../src/index.js"

describe("StructX.defined", () => {
  it("includes the key when the value is defined", () => {
    expect(StructX.defined("a", 1)).toEqual({ a: 1 })
  })

  it("omits the key when the value is undefined", () => {
    expect(StructX.defined("a", undefined)).toEqual({})
  })

  it("keeps null / false / 0 / '' — only undefined is dropped", () => {
    expect(StructX.defined("a", null)).toEqual({ a: null })
    expect(StructX.defined("a", 0)).toEqual({ a: 0 })
    expect(StructX.defined("a", "")).toEqual({ a: "" })
    expect(StructX.defined("a", false)).toEqual({ a: false })
  })

  it("spreads cleanly under exactOptionalPropertyTypes", () => {
    const maybe: number | undefined = undefined
    const out: { a: string; b?: number } = { a: "x", ...StructX.defined("b", maybe) }
    expect(out).toEqual({ a: "x" })
    expect("b" in out).toBe(false)
  })
})

describe("StructX.filterDefined", () => {
  it("drops undefined-valued keys, keeps the rest", () => {
    expect(StructX.filterDefined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null })
  })

  it("returns an empty object when every value is undefined", () => {
    expect(StructX.filterDefined({ a: undefined, b: undefined })).toEqual({})
  })
})

describe("StructX.truthy", () => {
  it("includes truthy values", () => {
    expect(StructX.truthy("a", 1)).toEqual({ a: 1 })
    expect(StructX.truthy("a", "x")).toEqual({ a: "x" })
  })

  it("drops falsy values", () => {
    expect(StructX.truthy("a", 0)).toEqual({})
    expect(StructX.truthy("a", "")).toEqual({})
    expect(StructX.truthy("a", false)).toEqual({})
    expect(StructX.truthy("a", null)).toEqual({})
    expect(StructX.truthy("a", undefined)).toEqual({})
  })
})
