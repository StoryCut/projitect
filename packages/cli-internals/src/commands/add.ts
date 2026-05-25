import { Effect } from "effect"

/**
 * `pjt add <blueprint>` — install a blueprint package and add a stub call to `.pjt.ts`.
 *
 * v0: stub. Full implementation needs PM detection (`pnpm add -D` / `npm install -D` / etc.) and
 * AST manipulation of `.pjt.ts` to insert the new blueprint call. Tracked for v0.1.
 */
export const add = (_params: { readonly blueprint: string }): Effect.Effect<string> =>
  Effect.succeed(
    "`pjt add` is not implemented in v0. Install the package manually and edit `.pjt.ts`.",
  )
