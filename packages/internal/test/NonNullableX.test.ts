import { describe, expect, it } from "vitest"
import { NonNullableX } from "../src/index.js"

describe("NonNullableX.match", () => {
  const handlers = {
    whenNullable: () => "none",
    whenNotNullable: (n: number) => `v${n}`,
  }

  it("calls whenNotNullable with the narrowed value", () => {
    expect(NonNullableX.match(5, handlers)).toBe("v5")
  })

  it("calls whenNullable for null and undefined", () => {
    expect(NonNullableX.match(null, handlers)).toBe("none")
    expect(NonNullableX.match(undefined, handlers)).toBe("none")
  })
})

describe("NonNullableX.map", () => {
  it("maps a non-nullable value", () => {
    expect(NonNullableX.map(5, (n) => n + 1)).toBe(6)
  })

  it("passes null / undefined through unchanged", () => {
    expect(NonNullableX.map(null, (n: number) => n + 1)).toBe(null)
    expect(NonNullableX.map(undefined, (n: number) => n + 1)).toBe(undefined)
  })
})

describe("NonNullableX.fromNullableOrThrow", () => {
  it("returns the value when non-nullable", () => {
    expect(NonNullableX.fromNullableOrThrow(5)).toBe(5)
  })

  it("throws when nullable", () => {
    expect(() => NonNullableX.fromNullableOrThrow(null)).toThrow()
  })
})
