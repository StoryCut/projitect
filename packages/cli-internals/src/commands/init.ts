import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Effect } from "effect"
import { Errors } from "@projitect/core"

export interface InitResult {
  readonly createdBlueprintFile: boolean
  readonly addedScript: boolean
  readonly addedDevDep: boolean
}

/**
 * `pjt init` — bootstrap a project. Writes the starter `.pjt.ts`, adds the `pjt` script and
 * `projitect` + `effect` devDeps to `package.json`. Subsequent runs go through the implicit
 * projitect blueprint instead.
 *
 * Detects missing prereqs (no `package.json`, no `.git/`) and surfaces explicit errors. The bin
 * shim handles the interactive prompts; this Effect just does the writes.
 */
export const init = (params: {
  readonly projectRoot: string
  readonly projitectVersion: string
  readonly effectRange: string
}): Effect.Effect<InitResult, Errors.InitGitMissing | Errors.InitPackageJsonMissing | Errors.FsWriteFailed> =>
  Effect.gen(function* () {
    const gitOk = yield* Effect.promise(() =>
      fs.access(path.join(params.projectRoot, ".git")).then(
        () => true,
        () => false,
      ),
    )
    if (!gitOk) {
      return yield* Effect.fail(
        new Errors.InitGitMissing({
          id: "pjt.init.git-missing",
          message: "No .git directory found. Run `git init` first, or rerun with --yes to let pjt bootstrap it.",
        }),
      )
    }
    const pkgPath = path.join(params.projectRoot, "package.json")
    const pkgRaw = yield* Effect.promise(() =>
      fs.readFile(pkgPath, "utf8").then(
        (s) => s as string | null,
        () => null,
      ),
    )
    if (pkgRaw === null) {
      return yield* Effect.fail(
        new Errors.InitPackageJsonMissing({
          id: "pjt.init.package-json-missing",
          message: "No package.json found. Run `npm init -y` first, or rerun with --yes to let pjt bootstrap it.",
        }),
      )
    }

    const pkg = safeParse(pkgRaw)
    const updated = injectScriptAndDeps(pkg, params.projitectVersion, params.effectRange)

    yield* Effect.tryPromise({
      try: () => fs.writeFile(pkgPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8"),
      catch: (e) =>
        new Errors.FsWriteFailed({
          id: "pjt.fs.write-failed",
          path: "package.json",
          cause: e instanceof Error ? e.message : String(e),
          message: "Failed to update package.json during init",
        }),
    })

    const bpPath = path.join(params.projectRoot, ".pjt.ts")
    const bpExists = yield* Effect.promise(() =>
      fs.access(bpPath).then(
        () => true,
        () => false,
      ),
    )
    if (!bpExists) {
      yield* Effect.tryPromise({
        try: () => fs.writeFile(bpPath, STARTER_PJT, "utf8"),
        catch: (e) =>
          new Errors.FsWriteFailed({
            id: "pjt.fs.write-failed",
            path: ".pjt.ts",
            cause: e instanceof Error ? e.message : String(e),
            message: "Failed to create .pjt.ts during init",
          }),
      })
    }

    return {
      createdBlueprintFile: !bpExists,
      addedScript: true,
      addedDevDep: true,
    }
  })

const safeParse = (s: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(s) as unknown
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const injectScriptAndDeps = (
  pkg: Record<string, unknown>,
  projitectVersion: string,
  effectRange: string,
): Record<string, unknown> => {
  const scripts =
    pkg["scripts"] && typeof pkg["scripts"] === "object" && !Array.isArray(pkg["scripts"])
      ? { ...(pkg["scripts"] as Record<string, unknown>) }
      : {}
  if (typeof scripts["pjt"] !== "string") scripts["pjt"] = "pjt"

  const dev =
    pkg["devDependencies"] && typeof pkg["devDependencies"] === "object" && !Array.isArray(pkg["devDependencies"])
      ? { ...(pkg["devDependencies"] as Record<string, unknown>) }
      : {}
  if (typeof dev["projitect"] !== "string") dev["projitect"] = `^${projitectVersion}`
  if (typeof dev["effect"] !== "string") dev["effect"] = effectRange

  return { ...pkg, scripts, devDependencies: dev }
}

const STARTER_PJT = `import { pjt } from "projitect/cli"

// Add blueprints to scaffold and verify your project. Run \`pjt remodel\` to apply, \`pjt inspect\` in CI.
// See https://projitect.dev/docs/getting-started for the full guide.
export default pjt({
  blueprints: [
    // gitignores.macOs(),
    // gitignores.node(),
  ],
})
`
