import { describe, expect, it } from "vitest"
import { PredicateX } from "../src/index.js"

describe("PredicateX.isPlainObject", () => {
  it("is true for plain objects", () => {
    expect(PredicateX.isPlainObject({})).toBe(true)
    expect(PredicateX.isPlainObject({ a: 1 })).toBe(true)
  })

  it("is false for arrays, null, and primitives", () => {
    expect(PredicateX.isPlainObject([])).toBe(false)
    expect(PredicateX.isPlainObject(null)).toBe(false)
    expect(PredicateX.isPlainObject(undefined)).toBe(false)
    expect(PredicateX.isPlainObject("x")).toBe(false)
    expect(PredicateX.isPlainObject(1)).toBe(false)
  })
})
