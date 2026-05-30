#!/usr/bin/env node
/**
 * `pjt` — the projitect CLI binary.
 *
 * 1. Registers `tsx` as a TypeScript loader so the user's `.pjt.ts` can be imported on Node
 *    versions older than 23.6 (when native type-stripping became stable).
 * 2. Calls `Command.run(rootCommand, ...)` from `effect/unstable/cli`, providing
 *    `NodePlatformLive` (FileSystem + Terminal + Stdio + Path) so the parsed argv flows into
 *    our handlers and `--help` / `--completions` / `Prompt` work out of the box.
 * 3. Exits with `process.exitCode` (set to non-zero by handlers when needed, e.g. drift
 *    detection).
 */

import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { register } from "tsx/esm/api"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("../package.json")

const unregister = register()
try {
  const { rootCommand, NodePlatformLive } = await import("@projitect/cli-internals")
  await Effect.runPromise(
    Command.run(rootCommand, { version: pkg.version }).pipe(Effect.provide(NodePlatformLive)),
  )
  await unregister()
  process.exit(process.exitCode ?? 0)
} catch (err) {
  await unregister()
  process.stderr.write(`pjt: fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
}
