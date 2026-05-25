import { promises as fs } from "node:fs"
import * as path from "node:path"
import { spawn } from "node:child_process"
import { Effect } from "effect"
import { Errors } from "@projitect/core"

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun"

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
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
  Effect.gen(function* () {
    for (const [filename, pm] of LOCKFILES) {
      const exists = yield* Effect.promise(() =>
        fs.access(path.join(params.projectRoot, filename)).then(
          () => true,
          () => false,
        ),
      )
      if (exists) return pm
    }
    return "npm"
  })

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
          if (code === 0) resolve()
          else reject(new Error(`${params.pm} ${args.join(" ")} exited with ${code}`))
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

const installArgs = (pm: PackageManager, pkg: string): ReadonlyArray<string> => {
  switch (pm) {
    case "pnpm":
      return ["add", "-D", pkg]
    case "yarn":
      return ["add", "-D", pkg]
    case "bun":
      return ["add", "-d", pkg]
    case "npm":
      return ["install", "-D", pkg]
  }
}

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
  readonly sections?: ReadonlyArray<string>
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
      const raw = await fs.readFile(pkgJsonPath, "utf8")
      const parsed = JSON.parse(raw) as { projitect?: unknown }
      const meta = parsed.projitect
      if (typeof meta !== "object" || meta === null) return null
      const m = meta as Record<string, unknown>
      const type = m["type"]
      const importStmt = m["import"]
      if (type !== "blueprint" && type !== "blueprint-set") return null
      if (typeof importStmt !== "string") return null
      const call = m["call"]
      const callTemplate = m["callTemplate"]
      const sections = m["sections"]
      const out: ProjitectPackageMetadata = {
        type,
        import: importStmt,
        ...(typeof call === "string" && { call }),
        ...(typeof callTemplate === "string" && { callTemplate }),
        ...(Array.isArray(sections) && {
          sections: sections.filter((s): s is string => typeof s === "string"),
        }),
      }
      return out
    } catch {
      return null
    }
  })
