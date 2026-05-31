// Consistent CLI helpers for the kanban scripts.

import { text as readTextStream } from "node:stream/consumers"
import { parseArgs as nodeParseArgs, type ParseArgsConfig } from "node:util"

// die() throws this; runScript() catches it and turns it into the right exit code.
// Scripts use die() exclusively — they never call process.exit themselves.
class ScriptError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = 1,
  ) {
    super(message)
    this.name = "ScriptError"
  }
}

export function die(msg: string, code = 1): never {
  throw new ScriptError(msg, code)
}

// Single CLI entry point for every script. main() can be sync or async; this catches and
// translates ScriptError into the matching exit code, and uncaught errors into exit 1.
export async function runScript(main: () => void | Promise<void>): Promise<void> {
  try {
    const result = main()
    if (result instanceof Promise) await result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    const code = error instanceof ScriptError ? error.exitCode : 1
    // eslint-disable-next-line unicorn/no-process-exit -- single CLI exit point
    process.exit(code)
  }
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function printText(text: string): void {
  process.stdout.write(`${text}\n`)
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ""
  return readTextStream(process.stdin)
}

// Thin wrapper around node:util parseArgs that defaults to strict + allowPositionals.
export function parseArgs<T extends ParseArgsConfig>(config: T) {
  return nodeParseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    ...config,
  })
}
