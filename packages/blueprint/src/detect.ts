import { Effect } from "effect"
import { BlueprintFileSystem } from "@projitect/core"
import type { Errors } from "@projitect/core"

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun"

/**
 * Inspect lockfiles to determine which package manager the project uses. Reads (in order):
 * `pnpm-lock.yaml`, `bun.lockb`, `yarn.lock`, `package-lock.json`. Falls back to `npm` if none
 * are present.
 *
 * Returns the detected manager; the blueprint must declare `read:` permission on the relevant
 * lockfile path globs (e.g. `pnpm-lock.yaml`).
 */
export const detectPackageManager: Effect.Effect<
  PackageManager,
  Errors.FsPermissionDenied | Errors.FsReadFailed,
  BlueprintFileSystem
> = Effect.gen(function* () {
  const fs = yield* BlueprintFileSystem
  if (yield* fs.exists("pnpm-lock.yaml")) {
    return "pnpm" as const
  }
  if (yield* fs.exists("bun.lockb")) {
    return "bun" as const
  }
  if (yield* fs.exists("yarn.lock")) {
    return "yarn" as const
  }
  if (yield* fs.exists("package-lock.json")) {
    return "npm" as const
  }
  return "npm" as const
})

/**
 * Read and parse `package.json` from the project root. Returns the parsed object as `unknown` —
 * blueprints should decode it with a `Schema` if they need typed access to fields.
 */
export const readPackageJson: Effect.Effect<
  unknown,
  Errors.FsReadFailed | Errors.FsPermissionDenied,
  BlueprintFileSystem
> = Effect.gen(function* () {
  const fs = yield* BlueprintFileSystem
  const raw = yield* fs.readFile("package.json")
  return JSON.parse(raw) as unknown
})
