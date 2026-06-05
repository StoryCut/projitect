import { Array, Option, Order, Record, Reducer, pipe } from "effect"
import { PredicateX } from "../PredicateX/index.js"

// ---------------------------------------------------------------------------
// JSON-tree helpers — projitect-specific extras not yet upstreamed to
// `@nunofyobiz/effect-extras`'s `RecordX`. See AGENTS.md "Where utilities live".
// ---------------------------------------------------------------------------

/**
 * Deep-merge two JSON values. Plain objects merge recursively; everything else (including
 * arrays) is replaced by `b`. Returns `b` when either side isn't a plain object.
 */
export const deepMerge = (a: unknown, b: unknown): unknown => {
  if (!PredicateX.isPlainObject(a) || !PredicateX.isPlainObject(b)) {
    return b
  }
  return Record.reduce(b, { ...a }, (accumulator, value, key) => {
    accumulator[key] = key in a ? deepMerge(a[key], value) : value
    return accumulator
  })
}

/**
 * {@link deepMerge} as a `Reducer` (monoid). Identity is `{}`; `deepMergeReducer.combineAll(layers)`
 * deep-merges object-valued layers left-to-right — the universal "merge N JSON objects into one"
 * fold, replacing a hand-rolled `Array.reduce(layers, {}, deepMerge)`. The `{}` identity is exact
 * for the object-valued inputs these folds carry.
 */
export const deepMergeReducer: Reducer.Reducer<unknown> = Reducer.make<unknown>(deepMerge, {})

/**
 * Canonicalize a JSON value by recursively sorting object keys (arrays keep their order). Two
 * values with the same content but different key order canonicalize equal — handy for
 * structural comparison via `JSON.stringify(canonicalize(x))`.
 */
export const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return Array.map(value, canonicalize)
  }
  if (!PredicateX.isPlainObject(value)) {
    return value
  }
  return pipe(
    Record.toEntries(value),
    Array.map(([key, v]) => [key, canonicalize(v)] as const),
    Array.sort(Order.mapInput(Order.String, ([key]: readonly [string, unknown]) => key)),
    Record.fromEntries,
  )
}

/**
 * Immutably delete the value at a dotted path (`["scripts", "build"]`) from a JSON object,
 * pruning parent objects that become empty. Returns `Some(newObject)` if the path existed and
 * was removed, `None` if it was absent (so callers can tell whether anything changed).
 */
export const deleteByPath = (object: unknown, path: readonly string[]): Option.Option<unknown> => {
  if (!PredicateX.isPlainObject(object)) {
    return Option.none()
  }
  const [head, ...rest] = path
  if (head === undefined) {
    return Option.none()
  }
  if (rest.length === 0) {
    if (!(head in object)) {
      return Option.none()
    }
    const { [head]: _removed, ...remaining } = object
    return Option.some(remaining)
  }
  return deleteByPath(object[head], rest).pipe(
    Option.map((newChild) => {
      if (PredicateX.isPlainObject(newChild) && Record.isEmptyRecord(newChild)) {
        const { [head]: _pruned, ...remaining } = object
        return remaining
      }
      return { ...object, [head]: newChild }
    }),
  )
}
