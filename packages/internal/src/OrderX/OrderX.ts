import type { Order } from "effect"
import { Number as EffectNumber } from "effect"

/**
 * Build an `Order` for an enum-like type from an explicit rank table. Lower rank sorts first.
 *
 * ```ts
 * const StatusOrder = OrderX.rankedEnum({ create: 0, modify: 1, ok: 2 })
 * ```
 */
export const rankedEnum =
  <const A extends PropertyKey>(ranks: Record<A, number>): Order.Order<A> =>
  (self, that) =>
    EffectNumber.sign(ranks[self] - ranks[that])
