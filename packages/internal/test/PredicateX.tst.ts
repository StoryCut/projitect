import { expect, test } from "tstyche"
import { PredicateX } from "../src/index.js"

test("PredicateX.isPlainObject narrows unknown to Record<string, unknown>", () => {
  const value: unknown = {}
  if (PredicateX.isPlainObject(value)) {
    // The point of the guard: inside the branch, `value` is a usable record.
    expect(value).type.toBe<Record<string, unknown>>()
  }
})
