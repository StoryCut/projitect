import { describe, expect, it } from "vitest"
import { PredicateX } from "../src/index.js"

describe("PredicateX.isNonEmptyString", () => {
  it("is true for a non-empty string", () => {
    expect(PredicateX.isNonEmptyString("x")).toBe(true)
  })

  it("is false for empty string, nullish, and non-strings", () => {
    expect(PredicateX.isNonEmptyString("")).toBe(false)
    expect(PredicateX.isNonEmptyString(null)).toBe(false)
    expect(PredicateX.isNonEmptyString(undefined)).toBe(false)
    expect(PredicateX.isNonEmptyString(1)).toBe(false)
    expect(PredicateX.isNonEmptyString({})).toBe(false)
  })
})

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

describe("PredicateX.matchRefine", () => {
  it("calls whenTrue with the narrowed value when the refinement holds", () => {
    const result = PredicateX.matchRefine(5, PredicateX.isPlainObject, {
      whenTrue: () => "object",
      whenFalse: () => "other",
    })
    expect(result).toBe("other")
  })
})
