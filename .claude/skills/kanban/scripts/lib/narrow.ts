// Narrowing helpers — the only place in scripts/ that uses `as` outside `as const`.
// Each cast follows a runtime check; eslint-disables are local + justified.
// See AGENTS.md → No type assertions for the project-wide rule.

export function asObject(x: unknown): Record<string, unknown> {
  if (typeof x === "object" && x !== null && !Array.isArray(x)) {
    return x as Record<string, unknown>
  }
  return {}
}

export function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

export function stringFrom(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined
}

export function isString(x: unknown): x is string {
  return typeof x === "string"
}

export function numberFrom(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined
}

export function buildTypedRecord<K extends string, V>(
  keys: readonly K[],
  get: (k: K) => V,
): Record<K, V> {
  const out = {} as Record<K, V>
  for (const k of keys) out[k] = get(k)
  return out
}
