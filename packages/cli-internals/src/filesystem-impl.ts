import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect, Layer } from "effect"
import { BlueprintFileSystem, Errors, type Permission } from "@projitect/core"
import type { BlueprintFileSystemShape } from "@projitect/core"
import { isPermitted, type FsOp } from "./permissions.js"

/**
 * Build the permission-gated `BlueprintFileSystem` Layer for one blueprint. The CLI provides a
 * fresh layer per blueprint, baking in that blueprint's `id` and declared `permissions`. All FS
 * paths get resolved relative to `projectRoot`; absolute paths or paths escaping `projectRoot`
 * are rejected with `pjt.fs.permission-denied`.
 *
 * This is the **soft sandbox**. A worker-process replacement is a tracked v2 follow-up; this
 * implementation enforces the same interface so the swap will be transparent to blueprint
 * authors.
 */
export const makeRealLayer = (config: {
  readonly blueprintId: string
  readonly permissions: ReadonlyArray<Permission.Permission>
  readonly projectRoot: string
}): Layer.Layer<BlueprintFileSystem> => {
  const { blueprintId, permissions, projectRoot } = config
  const resolved = path.resolve(projectRoot)

  const resolvePath = (p: string, op: FsOp): Effect.Effect<string, Errors.FsPermissionDenied> => {
    if (path.isAbsolute(p)) {
      return Effect.fail(
        new Errors.FsPermissionDenied({
          id: "pjt.fs.permission-denied",
          path: p,
          operation: op,
          blueprintId,
          message: `Absolute paths are not allowed in blueprints: ${p}`,
        }),
      )
    }
    const full = path.resolve(resolved, p)
    if (!full.startsWith(`${resolved}${path.sep}`) && full !== resolved) {
      return Effect.fail(
        new Errors.FsPermissionDenied({
          id: "pjt.fs.permission-denied",
          path: p,
          operation: op,
          blueprintId,
          message: `Path escapes project root: ${p}`,
        }),
      )
    }
    if (!isPermitted(permissions, op, p)) {
      return Effect.fail(
        new Errors.FsPermissionDenied({
          id: "pjt.fs.permission-denied",
          path: p,
          operation: op,
          blueprintId,
          message: `Blueprint ${blueprintId} did not declare ${op} permission for ${p}`,
        }),
      )
    }
    return Effect.succeed(full)
  }

  const shape: BlueprintFileSystemShape = {
    readFile: (p) =>
      resolvePath(p, "read").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.readFile(full, "utf8"),
            catch: (e) =>
              new Errors.FsReadFailed({
                id: "pjt.fs.read-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to read ${p}`,
              }),
          }),
        ),
      ),
    writeFile: (p, content) =>
      resolvePath(p, "write").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: async () => {
              await fs.mkdir(path.dirname(full), { recursive: true })
              await fs.writeFile(full, content, "utf8")
            },
            catch: (e) =>
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to write ${p}`,
              }),
          }),
        ),
      ),
    exists: (p) =>
      resolvePath(p, "exists").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () =>
              fs.access(full).then(
                () => true,
                () => false,
              ),
            catch: () => false as never,
          }).pipe(Effect.orElseSucceed(() => false)),
        ),
      ),
    remove: (p) =>
      resolvePath(p, "remove").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.rm(full, { recursive: true, force: true }),
            catch: (e) =>
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to remove ${p}`,
              }),
          }),
        ),
      ),
    mkdir: (p) =>
      resolvePath(p, "mkdir").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.mkdir(full, { recursive: true }).then(() => undefined),
            catch: (e) =>
              new Errors.FsWriteFailed({
                id: "pjt.fs.write-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to mkdir ${p}`,
              }),
          }),
        ),
      ),
    listDir: (p) =>
      resolvePath(p, "listDir").pipe(
        Effect.flatMap((full) =>
          Effect.tryPromise({
            try: () => fs.readdir(full),
            catch: (e) =>
              new Errors.FsReadFailed({
                id: "pjt.fs.read-failed",
                path: p,
                cause: e instanceof Error ? e.message : String(e),
                message: `Failed to list ${p}`,
              }),
          }),
        ),
      ),
  }

  return Layer.succeed(BlueprintFileSystem, shape)
}
