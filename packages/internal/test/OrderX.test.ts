import { describe, expect, it } from "vitest"
import { Array } from "effect"
import { OrderX } from "../src/index.js"

describe("OrderX.rankedEnum", () => {
  const order = OrderX.rankedEnum({ create: 0, modify: 1, ok: 2 })

  it("orders values by their explicit rank", () => {
    const items: readonly ("create" | "modify" | "ok")[] = ["ok", "create", "modify"]
    expect(Array.sort(items, order)).toEqual(["create", "modify", "ok"])
  })

  it("treats equal ranks as equal", () => {
    expect(order("ok", "ok")).toBe(0)
    expect(order("create", "ok")).toBeLessThan(0)
    expect(order("ok", "create")).toBeGreaterThan(0)
  })
})
