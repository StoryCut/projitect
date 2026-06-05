/**
 * Refinement: `true` for a plain object (non-null, non-array). v4's `Predicate` has no
 * `isRecord`; this is the canonical "is this a JSON object" guard, narrowing to
 * `Record<string, unknown>`.
 *
 * Projitect-specific extra not yet in `@nunofyobiz/effect-extras`'s `PredicateX` (which ships
 * `isNonEmptyString` and `matchRefine`). See AGENTS.md "Where utilities live".
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
