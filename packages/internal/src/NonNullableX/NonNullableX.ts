import type { Order, Ordering } from "effect"
import { Number as EffectNumber, Match, Predicate } from "effect"
import { dual } from "effect/Function"

/**
 * Throw an `Error` if `value` is `null`/`undefined`, otherwise narrow it to `NonNullable<A>`.
 */
export const fromNullableOrThrow = <A>(value: A, variableName?: string): NonNullable<A> => {
  if (Predicate.isNotNullish(value)) {
    return value
  }
  throw new Error(
    `Value is nullable: ${String(value)}${Predicate.isNotNullish(variableName) ? ` (variable name: ${variableName})` : ""}`,
  )
}

/**
 * Match on nullability: `whenNotNullable` with the narrowed value, else `whenNullable`.
 * Replaces `value === null ? … : …` / `value == null ? … : …` branches.
 */
export const match = dual<
  <A, B>(handlers: {
    whenNullable: () => B
    whenNotNullable: (value: NonNullable<A>) => B
  }) => (value: A) => B,
  <A, B>(
    value: A,
    handlers: {
      whenNullable: () => B
      whenNotNullable: (value: NonNullable<A>) => B
    },
  ) => B
>(
  2,
  <A, B>(
    value: A,
    {
      whenNullable,
      whenNotNullable,
    }: { whenNullable: () => B; whenNotNullable: (value: NonNullable<A>) => B },
  ): B => (Predicate.isNotNullish(value) ? whenNotNullable(value) : whenNullable()),
)

/**
 * Map over a value only when it's non-nullable; pass `null`/`undefined` through unchanged.
 */
export const map = dual<
  <A, B>(map: (a: NonNullable<A>) => B) => (a: A) => B | (null & A) | (undefined & A),
  <A, B>(a: A, map: (a: NonNullable<A>) => B) => B | (null & A) | (undefined & A)
>(2, <A, B>(a: A, map: (a: NonNullable<A>) => B): B | (null & A) | (undefined & A) => {
  if (Predicate.isNotNullish(a)) {
    return map(a)
  }

  if (Predicate.isNullish(a)) {
    return a
  }

  throw new Error(`Value is neither nullable nor non-nullable: ${String(a)}`)
})

/**
 * Lift a non-nullable function to one that passes `null`/`undefined` through.
 */
export const lift =
  <A, B>(map: (a: A) => B) =>
  (a: A | null | undefined): B | null | undefined => {
    if (Predicate.isNullish(a)) {
      return a
    }

    return map(a)
  }

/**
 * Wrap an `Order<A>` to handle `null` by pushing it to one side: `"value-null"` sorts nulls
 * last, `"null-value"` sorts them first.
 */
export const nullableOrder = dual<
  (behavior: "value-null" | "null-value") => <A>(order: Order.Order<A>) => Order.Order<A | null>,
  <A>(order: Order.Order<A>, behavior: "value-null" | "null-value") => Order.Order<A | null>
>(2, <A>(order: Order.Order<A>, behavior: "value-null" | "null-value"): Order.Order<A | null> => {
  const { nullableSortCategory, valueSortCategory } = Match.value(behavior).pipe(
    Match.when("value-null", () => ({
      nullableSortCategory: 1,
      valueSortCategory: 0,
    })),
    Match.when("null-value", () => ({
      nullableSortCategory: 0,
      valueSortCategory: 1,
    })),
    Match.exhaustive,
  )

  return (a: A | null, b: A | null): Ordering.Ordering => {
    if (Predicate.isNotNullish(a) && Predicate.isNotNullish(b)) {
      return order(a, b)
    }

    const aCategory = Predicate.isNotNullish(a) ? valueSortCategory : nullableSortCategory

    const bCategory = Predicate.isNotNullish(b) ? valueSortCategory : nullableSortCategory

    return EffectNumber.sign(aCategory - bCategory)
  }
})
