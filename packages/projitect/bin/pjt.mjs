#!/usr/bin/env node
/**
 * `pjt` — the projitect CLI binary.
 *
 * 1. Registers `tsx` as a TypeScript loader so the user's `.pjt.ts` can be imported on Node
 *    versions older than 23.6 (when native type-stripping became stable).
 * 2. Calls the dispatcher from `@projitect/cli-internals` with the parsed argv/env/cwd.
 * 3. Writes the result to stdout/stderr and exits with the matching code.
 *
 * Native type-stripping on Node 23.6+ would let us skip step 1 entirely, but the tsx register
 * is cheap and lets the same bin shim work on every supported Node version.
 */

import { Effect } from "effect"
import { register } from "tsx/esm/api"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("../package.json")

const unregister = register()
try {
  const { dispatch } = await import("@projitect/cli-internals")
  const result = await Effect.runPromise(
    dispatch({
      argv: process.argv.slice(2),
      env: process.env,
      cwd: process.cwd(),
      projitectVersion: pkg.version,
      effectRange: pkg.peerDependencies?.effect ?? "^4.0.0-beta.70",
    }),
  )
  process.stdout.write(`${result.output}\n`)
  await unregister()
  process.exit(result.exitCode)
} catch (err) {
  await unregister()
  process.stderr.write(`pjt: fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
}
