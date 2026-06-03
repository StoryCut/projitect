import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Errors, PjtLock } from "@projitect/core"

const LOCKFILE_NAME = ".pjt.lock"
const CURRENT_VERSION = 1 as const

const lockfilePath = (projectRoot: string): string => path.join(projectRoot, LOCKFILE_NAME)

/**
 * Read `.pjt.lock` from `projectRoot`. Returns `null` if the file doesn't exist (fresh project).
 * Fails with `pjt.lock.parse-failed` on JSON or schema errors, `pjt.lock.version-mismatch` if
 * the lockfile was written by a newer projitect.
 */
export const readLockfile = (params: {
  readonly projectRoot: string
}): Effect.Effect<PjtLock.PjtLock | null, Errors.LockParseFailed | Errors.LockVersionMismatch> => {
  const file = lockfilePath(params.projectRoot)
  return Effect.gen(function* () {
    const raw = yield* Effect.promise(() =>
      fs.readFile(file, "utf8").then(
        (s) => s as string | null,
        () => null,
      ),
    )
    if (raw === null) {
      return null
    }

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (e) =>
        new Errors.LockParseFailed({
          id: "pjt.lock.parse-failed",
          path: file,
          cause: e instanceof Error ? e.message : String(e),
          message: `Could not parse ${LOCKFILE_NAME}. The file is corrupted — delete it and rerun \`pjt remodel\` to rebuild.`,
        }),
    })

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      typeof parsed.version === "number" &&
      parsed.version > CURRENT_VERSION
    ) {
      return yield* new Errors.LockVersionMismatch({
        id: "pjt.lock.version-mismatch",
        found: parsed.version,
        expected: CURRENT_VERSION,
        message: `${LOCKFILE_NAME} was written by a newer projitect (version ${parsed.version}). Upgrade the \`projitect\` devDep.`,
      })
    }

    return yield* Schema.decodeUnknownEffect(PjtLock.PjtLock)(parsed).pipe(
      Effect.mapError(
        (e) =>
          new Errors.LockParseFailed({
            id: "pjt.lock.parse-failed",
            path: file,
            cause: String(e),
            message: `${LOCKFILE_NAME} does not match the expected schema. Delete it and rerun \`pjt remodel\` to rebuild.`,
          }),
      ),
    )
  })
}

/**
 * Write `.pjt.lock` to `projectRoot`. Always writes the current schema version.
 */
export const writeLockfile = (params: {
  readonly projectRoot: string
  readonly lock: PjtLock.PjtLock
}): Effect.Effect<void, Errors.FsWriteFailed> => {
  const file = lockfilePath(params.projectRoot)
  return Effect.tryPromise({
    try: () => fs.writeFile(file, `${JSON.stringify(params.lock, null, 2)}\n`, "utf8"),
    catch: (e) =>
      new Errors.FsWriteFailed({
        id: "pjt.fs.write-failed",
        path: LOCKFILE_NAME,
        cause: e instanceof Error ? e.message : String(e),
        message: `Failed to write ${LOCKFILE_NAME}`,
      }),
  })
}

/**
 * Build the set of blueprint ids currently expected to be present from a lockfile. Used by the
 * planner to compute which blueprints have left the tree (their ops will be turned into
 * removals on next apply).
 */
export const blueprintIds = (lock: PjtLock.PjtLock | null): ReadonlySet<string> =>
  new Set(lock === null ? [] : Object.keys(lock.blueprints))
