---
"projitect": patch
---

Generic `*X` utilities now come from the published `@nunofyobiz/effect-extras` package instead of
the in-repo `@projitect/internal` copy. `StructX`, `PredicateX.isNonEmptyString`, and
`NonNullableX.match` are imported from the package; `@projitect/internal` is slimmed to the
projitect-specific extras not yet upstreamed (`RecordX` JSON-tree ops, `StringX` line-editing,
`PredicateX.isPlainObject`). `effect` is pinned to the exact `4.0.0-beta.74` the package requires
as its peer.

Internal refactor + dependency change with no change to any public API (Blueprint / ChangeSet /
Permission shapes, CLI flags, error ids, lockfile schema all unchanged) → **patch** per the
AGENTS.md "Versioning (lockstep)" table.
