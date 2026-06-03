import { promises as fs } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { Array, Effect, Match, Option, Predicate } from "effect"
import { Errors } from "@projitect/core"
import { PredicateX, StructX } from "@projitect/internal"

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun"

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lockb", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
]

/**
 * Detect the user's package manager by walking up from `projectRoot` looking for known
 * lockfiles. Falls back to `npm` if nothing is found. Used by `pjt add` to decide which install
 * command to shell out to.
 */
export const detect = (params: {
  readonly projectRoot: string
}): Effect.Effect<PackageManager, Errors.PmNotDetected> =>
  Effect.map(
    Effect.findFirst(LOCKFILES, ([filename]) =>
      Effect.promise(() =>
        fs.access(path.join(params.projectRoot, filename)).then(
          () => true,
          () => false,
        ),
      ),
    ),
    Option.match({
      onSome: ([, pm]) => pm,
      onNone: (): PackageManager => "npm",
    }),
  )

/**
 * Run `<pm> add -D <pkg>` in `projectRoot`. Wraps spawn failures (non-zero exit, PM not
 * installed) as `pjt.pm.install-failed`.
 */
export const installDev = (params: {
  readonly projectRoot: string
  readonly pm: PackageManager
  readonly pkg: string
}): Effect.Effect<void, Errors.PmInstallFailed> => {
  const args = installArgs(params.pm, params.pkg)
  return Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(params.pm, args, {
          cwd: params.projectRoot,
          stdio: "inherit",
        })
        child.on("error", reject)
        child.on("close", (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`${params.pm} ${args.join(" ")} exited with ${String(code)}`))
          }
        })
      }),
    catch: (e) =>
      new Errors.PmInstallFailed({
        id: "pjt.pm.install-failed",
        packageManager: params.pm,
        pkg: params.pkg,
        cause: e instanceof Error ? e.message : String(e),
        message: `Failed to install \`${params.pkg}\` via ${params.pm}`,
      }),
  })
}

const installArgs = (pm: PackageManager, pkg: string): readonly string[] =>
  Match.value(pm).pipe(
    Match.whenOr("pnpm", "yarn", () => ["add", "-D", pkg]),
    Match.when("bun", () => ["add", "-d", pkg]),
    Match.when("npm", () => ["install", "-D", pkg]),
    Match.exhaustive,
  )

/**
 * The shape of the `"projitect"` field in a blueprint package's `package.json`. Defines how
 * `pjt add <pkg>` should splice into the user's `.pjt.ts`.
 */
export interface ProjitectPackageMetadata {
  /**
   * `"blueprint"` for single-call packages (e.g. one default export). `"blueprint-set"` for
   * packages that expose multiple sections (e.g. `gitignores.macOs()`, `gitignores.node()`).
   */
  readonly type: "blueprint" | "blueprint-set"
  /** The import statement to splice into `// pjt:imports`, e.g. `import { foo } from "foo"`. */
  readonly import: string
  /** For `type: "blueprint"` only — the call template, e.g. `myBlueprint()`. */
  readonly call?: string
  /** For `type: "blueprint-set"` only — substitute `{section}` with each chosen name. */
  readonly callTemplate?: string
  /** For `type: "blueprint-set"` only — the list of available section names. */
  readonly sections?: readonly string[]
}

/**
 * Read the installed package's `package.json` and return its `"projitect"` metadata, if any.
 * Returns null if the package doesn't have the field; `pjt add` falls back to install-only
 * behavior with a printed instruction snippet.
 */
export const readProjitectMetadata = (params: {
  readonly projectRoot: string
  readonly pkg: string
}): Effect.Effect<ProjitectPackageMetadata | null> =>
  Effect.promise(async () => {
    const pkgJsonPath = path.join(params.projectRoot, "node_modules", params.pkg, "package.json")
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(pkgJsonPath, "utf8"))
      if (!PredicateX.isPlainObject(parsed)) {
        return null
      }
      const meta = parsed["projitect"]
      if (!PredicateX.isPlainObject(meta)) {
        return null
      }
      const type = meta["type"]
      const importStmt = meta["import"]
      if (type !== "blueprint" && type !== "blueprint-set") {
        return null
      }
      if (!Predicate.isString(importStmt)) {
        return null
      }
      const sections = meta["sections"]
      return {
        type,
        import: importStmt,
        ...StructX.defined("call", Predicate.isString(meta["call"]) ? meta["call"] : undefined),
        ...StructX.defined(
          "callTemplate",
          Predicate.isString(meta["callTemplate"]) ? meta["callTemplate"] : undefined,
        ),
        ...StructX.defined(
          "sections",
          Array.isArray(sections) ? Array.filter(sections, Predicate.isString) : undefined,
        ),
      }
    } catch {
      return null
    }
  })
