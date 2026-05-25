import * as path from "node:path"
import { promises as fs } from "node:fs"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import { Errors, type BlueprintFileSystem } from "@projitect/core"
import type { Blueprint } from "@projitect/core"
import type { DirectoryBlueprint } from "@projitect/blueprint"

/**
 * The shape `.pjt.ts` produces when the user calls `pjt({ blueprints, config })`. Either an
 * array of blueprints or an Effect that builds the array. The runner unwraps the Effect form
 * inside the planner so blueprint-tree construction itself can be a typed pipeline.
 *
 * The Effect form may fail with any `BlueprintError` and may require `BlueprintFileSystem` —
 * the CLI provides a "config-time" FS layer with broad read permissions before invoking it.
 */
export type BlueprintTree = ReadonlyArray<Blueprint.Blueprint | DirectoryBlueprint>

export interface ProjitectFile {
  readonly _tag: "ProjitectConfig"
  readonly blueprints:
    | BlueprintTree
    | Effect.Effect<BlueprintTree, Errors.BlueprintError, BlueprintFileSystem>
  readonly config?: Record<string, unknown>
}

/**
 * The user calls this in `.pjt.ts`:
 *
 *   export default pjt({ blueprints: [...] })
 *
 * It's an identity tag — we only inspect the default export for the `_tag` marker so we can
 * distinguish accidental other exports from a real projitect config.
 */
export const pjt = (input: {
  readonly blueprints: ProjitectFile["blueprints"]
  readonly config?: Record<string, unknown>
}): ProjitectFile => ({
  _tag: "ProjitectConfig",
  blueprints: input.blueprints,
  ...(input.config !== undefined && { config: input.config }),
})

/** Type guard: did the user pass an Effect, or a literal array? */
export const isEffectTree = (
  v: ProjitectFile["blueprints"],
): v is Effect.Effect<BlueprintTree, Errors.BlueprintError, BlueprintFileSystem> =>
  !Array.isArray(v)

/**
 * Dynamic-import the user's `.pjt.ts` and return the typed default export.
 *
 * The user's file is TypeScript. On Node 23.6+ with `--experimental-strip-types`, the import
 * succeeds natively. On older Node, the binary shim in `packages/projitect` registers `tsx` as
 * a loader before reaching this function. Either way, by the time we get here, `import(path)`
 * Just Works.
 */
export const loadBlueprintFile = (params: {
  readonly blueprintFile: string
  readonly projectRoot: string
}): Effect.Effect<
  ProjitectFile,
  Errors.LoaderImportFailed | Errors.LoaderInvalidDefaultExport | Errors.ConfigBlueprintFileNotFound
> => {
  const { blueprintFile, projectRoot } = params
  const full = path.resolve(projectRoot, blueprintFile)
  return Effect.gen(function* () {
    const exists = yield* Effect.promise(() =>
      fs.access(full).then(
        () => true,
        () => false,
      ),
    )
    if (!exists) {
      return yield* Effect.fail(
        new Errors.ConfigBlueprintFileNotFound({
          id: "pjt.config.blueprint-file-not-found",
          blueprintFile,
          message: `No blueprint file found at ${full}. Run \`pjt init\` to create one.`,
        }),
      )
    }
    const mod = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(full).href) as Promise<{ default?: unknown }>,
      catch: (e) =>
        new Errors.LoaderImportFailed({
          id: "pjt.loader.import-failed",
          blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Failed to import ${blueprintFile}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    })
    const value = mod.default
    if (!isProjitectFile(value)) {
      return yield* Effect.fail(
        new Errors.LoaderInvalidDefaultExport({
          id: "pjt.loader.invalid-default-export",
          blueprintFile,
          received: describe(value),
          message: `${blueprintFile} must \`export default pjt({...})\`. Received ${describe(value)}.`,
        }),
      )
    }
    return value
  })
}

const isProjitectFile = (v: unknown): v is ProjitectFile =>
  typeof v === "object" && v !== null && (v as { _tag?: unknown })._tag === "ProjitectConfig"

const describe = (v: unknown): string =>
  v === undefined
    ? "undefined"
    : v === null
      ? "null"
      : Array.isArray(v)
        ? "Array"
        : typeof v === "object"
          ? 'object without `_tag: "ProjitectConfig"`'
          : typeof v
