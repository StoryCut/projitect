import { describe, expect, it } from "vitest"
import { StringX } from "../src/index.js"

describe("StringX.replaceLineRange", () => {
  it("replaces an inclusive line range", () => {
    expect(StringX.replaceLineRange("a\nb\nc\nd", 1, 2, ["X"])).toBe("a\nX\nd")
  })

  it("deletes the range when replacement is empty", () => {
    expect(StringX.replaceLineRange("a\nb\nc\nd", 1, 2, [])).toBe("a\nd")
  })

  it("can replace a single line", () => {
    expect(StringX.replaceLineRange("a\nb\nc", 1, 1, ["X", "Y"])).toBe("a\nX\nY\nc")
  })
})

describe("StringX.insertBeforeLine", () => {
  it("inserts before the anchor, preserving the anchor line", () => {
    expect(StringX.insertBeforeLine("a\nb\nc", 1, ["X"])).toBe("a\nX\nb\nc")
  })

  it("appends when the anchor is the end index", () => {
    expect(StringX.insertBeforeLine("a\nb", 2, ["X"])).toBe("a\nb\nX")
  })
})
