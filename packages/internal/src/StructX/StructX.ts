import { Option, Predicate, Record } from "effect"
import { dual } from "effect/Function"

/**
 * Conditionally include a key in an object literal.
 *
 * Useful because `tsconfig.base.json` sets `exactOptionalPropertyTypes: true` (required by
 * Effect Schema). Under that flag, spreading `{ key: undefined }` into an object whose key is
 * `key?: T` is a type error — the property must be *absent*, not present-but-undefined. This
 * helper returns a singleton record when the value is defined, or `{}` when it's `undefined`,
 * so it can be spread safely:
 *
 * ```ts
 * const out = { ...StructX.defined("description", spec.description) }
 * ```
 *
 * See https://www.typescriptlang.org/tsconfig/#exactOptionalPropertyTypes
 */
export const defined = <const K extends string, V>(
  name: K,
  value: V | undefined,
): Partial<Record<K, Exclude<V, undefined>>> =>
  Predicate.isUndefined(value) ? {} : Record.singleton(name, value as Exclude<V, undefined>)

/**
 * Drop every `undefined`-valued key from a record, narrowing the value types to exclude
 * `undefined`. Useful for update payloads where `undefined` means "leave unchanged" and any
 * other value (including `null`) means "set to this".
 */
export const filterDefined = <R extends Record<string, unknown>>(
  record: R,
): Partial<{ [P in keyof R]: Exclude<R[P], undefined> }> =>
  Object.entries(record).reduce<Partial<{ [P in keyof R]: Exclude<R[P], undefined> }>>(
    (accumulator, [key, value]) => ({ ...accumulator, ...defined(key, value) }),
    {},
  )

/**
 * Conditionally include a key sourced from an `Option`: a singleton record when `Some`, `{}`
 * when `None`.
 */
export const some = <const K extends string, V>(
  name: K,
  value: Option.Option<V>,
): Partial<Record<K, V>> =>
  Option.match(value, {
    onSome: (someValue) => Record.singleton(name, someValue),
    onNone: () => ({}),
  })

/**
 * Conditionally include a key when its value is truthy (drops `false`, `0`, `""`, `null`,
 * `undefined`).
 */
export const truthy = <const K extends string, V>(
  name: K,
  value: V,
): Partial<Record<K, Exclude<NonNullable<V>, false | 0 | "">>> =>
  Predicate.isTruthy(value)
    ? Record.singleton(name, value as Exclude<NonNullable<V>, false | 0 | "">)
    : {}

/**
 * Refinement: narrows `object` to one whose `key` is non-nullable.
 */
export const hasNotNullableProperty = dual<
  <T, K extends keyof T>(key: K) => (object: T) => object is T & Record<K, NonNullable<T[K]>>,
  <T, K extends keyof T>(object: T, key: K) => object is T & Record<K, NonNullable<T[K]>>
>(
  2,
  <T, K extends keyof T>(object: T, key: K): object is T & Record<K, NonNullable<T[K]>> =>
    Predicate.hasProperty(object, key) && Predicate.isNotNullish(object[key]),
)
