import { Predicate, String } from "effect"
import { dual } from "effect/Function"

/**
 * Match on a refinement: call `whenTrue` with the narrowed value if the predicate holds,
 * otherwise `whenFalse`. A lightweight alternative to a full `Match` pipeline for a single
 * refinement.
 */
export const matchRefine = dual<
  <A, B extends A, C>(
    predicate: Predicate.Refinement<A, B>,
    handlers: {
      whenFalse: () => C
      whenTrue: (value: B) => C
    },
  ) => (value: A) => C,
  <A, B extends A, C>(
    value: A,
    predicate: Predicate.Refinement<A, B>,
    handlers: { whenFalse: () => C; whenTrue: (value: B) => C },
  ) => C
>(
  3,
  <A, B extends A, C>(
    value: A,
    predicate: Predicate.Refinement<A, B>,
    handlers: { whenFalse: () => C; whenTrue: (value: B) => C },
  ): C => (predicate(value) ? handlers.whenTrue(value) : handlers.whenFalse()),
)

/**
 * Refinement: `true` only for a non-nullish, non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return Predicate.isNotNullish(value) && Predicate.isString(value) && String.isNonEmpty(value)
}

/**
 * Refinement: `true` for a plain object (non-null, non-array). v4's `Predicate` has no
 * `isRecord`; this is the canonical "is this a JSON object" guard, narrowing to
 * `Record<string, unknown>`.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
