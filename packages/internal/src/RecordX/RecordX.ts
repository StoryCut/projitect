import { Array, Option, Order, Predicate, Record, Reducer, pipe } from "effect"
import { dual } from "effect/Function"
import { PredicateX } from "../PredicateX/index.js"

export const isNonEmptyRecord = <K extends PropertyKey, V>(
  record: Record<K, V>,
): record is Record<K, V> => pipe(record, Predicate.not(Record.isEmptyRecord))

/**
 * Modify the value at `key` in `self`, leaving the record unchanged if the key doesn't exist.
 * v4's `Record.modify` returns `Option<Record>` (`None` when absent); this picks the
 * "do nothing if absent" semantics most call sites assume.
 */
export const modifyIfExists: {
  <K extends string, A>(key: NoInfer<K>, f: (a: A) => A): (self: Record<K, A>) => Record<K, A>
  <K extends string, A>(self: Record<K, A>, key: NoInfer<K>, f: (a: A) => A): Record<K, A>
} = dual(
  3,
  <K extends string, A>(self: Record<K, A>, key: K, f: (a: A) => A): Record<K, A> =>
    pipe(
      Record.modify(self, key, f),
      Option.getOrElse(() => self),
    ),
)

export const keysAs =
  <K2 extends PropertyKey>() =>
  <K1 extends PropertyKey, V>(record: Record<K1, V>): Record<K2, V> =>
    record as unknown as Record<K2, V>

export const getOrThrow = dual<
  <K extends string | symbol>(key: K) => <V>(record: Record<K, V>) => V,
  <K extends string | symbol, V>(record: Record<K, V>, key: K) => V
>(
  2,
  <K extends string | symbol, V>(record: Record<K, V>, key: K): V =>
    getOrThrowWith(
      record,
      key,
      (key) =>
        new Error(
          `Key ${String(key)} not found in record. Existing keys=${Record.keys(record).join(", ")}`,
        ),
    ),
)

export const getOrThrowWith = dual<
  <K extends string | symbol>(
    key: K,
    onNone: (key: K) => unknown,
  ) => <V>(record: Record<K, V>) => V,
  <K extends string | symbol, V>(record: Record<K, V>, key: K, onNone: (key: K) => unknown) => V
>(
  3,
  <K extends string | symbol, V>(record: Record<K, V>, key: K, onNone: (key: K) => unknown): V =>
    Record.get(record, key).pipe(Option.getOrThrowWith(() => onNone(key))),
)

export const upsert = dual<
  <K extends string | symbol, V>(
    key: K,
    upsert: (existingValue: Option.Option<V>) => V,
  ) => (record: Record<K, V>) => Record<K, V>,
  <K extends string | symbol, V>(
    record: Record<K, V>,
    key: K,
    upsert: (existingValue: Option.Option<V>) => V,
  ) => Record<K, V>
>(
  3,
  <K extends string | symbol, V>(
    record: Record<K, V>,
    key: K,
    upsert: (existingValue: Option.Option<V>) => V,
  ): Record<K, V> => {
    const existingValue = Record.get(record, key)
    const updatedValue = upsert(existingValue)
    return Record.set(record, key, updatedValue)
  },
)

/**
 * Collect an iterable of values into a record, deriving each key with `identify`. Last value
 * wins on key collision.
 */
export const collectBy = dual<
  <K extends string | symbol, V>(identify: (v: V) => K) => (values: Iterable<V>) => Record<K, V>,
  <K extends string | symbol, V>(values: Iterable<V>, identify: (v: V) => K) => Record<K, V>
>(
  2,
  <K extends string | symbol, V>(values: Iterable<V>, identify: (v: V) => K): Record<K, V> =>
    Array.reduce(values, {} as Record<K, V>, (accumulator, value) =>
      Record.set<K, V, K, V>(accumulator, identify(value), value),
    ),
)

// ---------------------------------------------------------------------------
// JSON-tree helpers (projitect additions — not in StoryCut's RecordX)
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
