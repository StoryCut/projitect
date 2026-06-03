import { expect, test } from "tstyche"
import { StructX } from "../src/index.js"

test("StructX.defined narrows the value type to exclude undefined", () => {
  const value: number | undefined = 5
  expect(StructX.defined("k", value)).type.toBe<Partial<Record<"k", number>>>()
})

test("StructX.defined result spreads into an exactOptionalPropertyTypes object", () => {
  const value: string | undefined = undefined
  // The point of `defined`: this spread is a *type error* without it under
  // exactOptionalPropertyTypes (`{ b: undefined }` is not assignable to `b?: string`).
  const out: { a: string; b?: string } = { a: "x", ...StructX.defined("b", value) }
  expect(out).type.toBe<{ a: string; b?: string }>()
})
