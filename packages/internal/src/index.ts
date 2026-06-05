/**
 * @projitect/internal
 *
 * Projitect-specific Effect-extension helpers that have **not** been upstreamed to
 * `@nunofyobiz/effect-extras` yet: JSON-tree ops (`RecordX` — `deepMerge`, `deepMergeReducer`,
 * `canonicalize`, `deleteByPath`), line-range text editing (`StringX` — `replaceLineRange`,
 * `insertBeforeLine`), and the `isPlainObject` guard (`PredicateX`). Private, never-published;
 * bundled into the consuming package at build time. The generic `*X` surface lives in the
 * external package — see AGENTS.md "Where utilities live".
 */
export * from "./PredicateX/index.js"
export * from "./StringX/index.js"
export * from "./RecordX/index.js"
