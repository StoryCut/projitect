import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Effect } from "effect"
import { Errors, type ProjitectConfig } from "@projitect/core"
import { remodel, type RemodelResult } from "./remodel.js"

export interface InitResult {
  readonly seededBlueprintFile: boolean
  readonly remodel: RemodelResult
}

/**
 * `pjt init` — bootstrap projitect in the current project.
 *
 * Verifies the prerequisites (`.git/` and `package.json` both present), seeds an empty
 * `.pjt.ts` with the marker structure if absent, then delegates to `remodel` which runs the
 * standard plan/apply/lockfile-write pipeline. The projitect blueprint (prepended automatically
 * by `projitect/cli`'s `pjt()`) writes the package.json entries and the `.pjt.ts` import region
 * on its first apply.
 *
 * No special-case code for "the projitect bootstrap" lives here — the projitect blueprint owns
 * those concerns and runs through the same pipeline as every other blueprint.
 */
export const init = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
}): Effect.Effect<InitResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    yield* requireGit(params.config.projectRoot)
    yield* requirePackageJson(params.config.projectRoot)

    const seededBlueprintFile = yield* seedBlueprintFileIfAbsent(
      params.config.projectRoot,
      params.config.blueprintFile,
    )

    const remodelResult = yield* remodel({ config: params.config })

    return { seededBlueprintFile, remodel: remodelResult }
  })

const requireGit = (projectRoot: string): Effect.Effect<void, Errors.InitGitMissing> =>
  Effect.gen(function* () {
    const ok = yield* Effect.promise(() =>
      fs.access(path.join(projectRoot, ".git")).then(
        () => true,
        () => false,
      ),
    )
    if (!ok) {
      return yield* Effect.fail(
        new Errors.InitGitMissing({
          id: "pjt.init.git-missing",
          message:
            "No `.git` directory found. Run `git init` first, then re-run `pjt init`.",
        }),
      )
    }
  })

const requirePackageJson = (
  projectRoot: string,
): Effect.Effect<void, Errors.InitPackageJsonMissing> =>
  Effect.gen(function* () {
    const ok = yield* Effect.promise(() =>
      fs.access(path.join(projectRoot, "package.json")).then(
        () => true,
        () => false,
      ),
    )
    if (!ok) {
      return yield* Effect.fail(
        new Errors.InitPackageJsonMissing({
          id: "pjt.init.package-json-missing",
          message:
            "No `package.json` found. Run `npm init -y` (or your PM equivalent) first, then re-run `pjt init`.",
        }),
      )
    }
  })

const seedBlueprintFileIfAbsent = (
  projectRoot: string,
  blueprintFile: string,
): Effect.Effect<boolean, Errors.FsWriteFailed> =>
  Effect.gen(function* () {
    const full = path.join(projectRoot, blueprintFile)
    const exists = yield* Effect.promise(() =>
      fs.access(full).then(
        () => true,
        () => false,
      ),
    )
    if (exists) return false

    yield* Effect.tryPromise({
      try: () => fs.writeFile(full, STARTER_PJT_TS, "utf8"),
      catch: (e) =>
        new Errors.FsWriteFailed({
          id: "pjt.fs.write-failed",
          path: blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Failed to seed ${blueprintFile}`,
        }),
    })
    return true
  })

/**
 * Starter `.pjt.ts` template. Three marker regions: the projitect blueprint owns
 * `pjt:projitect:imports` (it writes the `import { pjt } from "projitect/cli"` line on first
 * remodel). The other two — `pjt:imports` and `pjt:blueprints` — are **convention anchors**
 * that `pjt add` splices into; they are not managed regions and don't appear in `.pjt.lock`.
 */
const STARTER_PJT_TS = `// pjt:projitect:imports start
import { pjt } from "projitect/cli"
// pjt:projitect:imports end

// pjt:imports start
// pjt:imports end

export default pjt({
  blueprints: [
    // pjt:blueprints start
    // pjt:blueprints end
  ],
})
`
