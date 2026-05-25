import { Effect } from "effect"
import type { Errors } from "@projitect/core"
import { resolveConfig, parseEnv, type WritablePartialConfig } from "../config-cascade.js"
import { inspect } from "./inspect.js"
import { remodel } from "./remodel.js"
import { build } from "./build.js"
import { init } from "./init.js"
import { explain } from "./explain.js"
import { add } from "./add.js"

export interface DispatchInput {
  readonly argv: ReadonlyArray<string>
  readonly env: Readonly<Record<string, string | undefined>>
  readonly cwd: string
  readonly projitectVersion: string
  readonly effectRange: string
}

export interface DispatchResult {
  readonly output: string
  readonly exitCode: number
}

/**
 * Top-level dispatcher. Parses `argv`, resolves config, and runs the matching command.
 * Returns `{ output, exitCode }`; the bin shim is responsible for writing to stdout and exiting.
 */
export const dispatch = (input: DispatchInput): Effect.Effect<DispatchResult> =>
  Effect.gen(function* () {
    const [command, ...rest] = input.argv

    if (command === undefined || command === "--help" || command === "-h" || command === "help") {
      return { output: HELP_TEXT, exitCode: 0 }
    }

    if (command === "--version" || command === "-v") {
      return { output: `pjt v${input.projitectVersion}`, exitCode: 0 }
    }

    if (command === "explain") {
      const id = rest[0]
      if (id === undefined) return { output: "usage: pjt explain <error-id>", exitCode: 1 }
      const out = yield* explain({ errorId: id })
      return { output: out, exitCode: 0 }
    }

    const env = parseEnv(input.env)
    const cliArgs = parseCliArgs(rest)
    const config = resolveConfig({
      env,
      cliArgs: { ...cliArgs, projectRoot: cliArgs.projectRoot ?? input.cwd },
    })

    switch (command) {
      case "inspect":
        return yield* runWithErrorHandling(
          inspect({ config }).pipe(
            Effect.map((r) => ({ output: r.output, exitCode: r.hasDrift ? 1 : 0 })),
          ),
        )
      case "remodel":
        return yield* runWithErrorHandling(
          remodel({ config }).pipe(
            Effect.map((r) => {
              const parts: Array<string> = []
              if (r.written.length > 0) {
                parts.push(
                  `Wrote ${r.written.length} file${r.written.length === 1 ? "" : "s"}:\n` +
                    r.written.map((p) => `  ${p}`).join("\n"),
                )
              }
              if (r.removed.length > 0) {
                parts.push(
                  `Cleaned up ${r.removed.length} orphan${r.removed.length === 1 ? "" : "s"}:\n` +
                    r.removed.map((p) => `  ${p}`).join("\n"),
                )
              }
              return {
                output:
                  parts.length === 0
                    ? "Project already in sync. No changes written."
                    : parts.join("\n"),
                exitCode: 0,
              }
            }),
          ),
        )
      case "build": {
        const force = rest.includes("--force")
        return yield* runWithErrorHandling(
          build({ config, force }).pipe(
            Effect.map(() => ({
              output: "`pjt build` is not yet implemented. Use `pjt remodel` to apply blueprints.",
              exitCode: 0,
            })),
          ),
        )
      }
      case "init":
        return yield* runWithErrorHandling(
          init({ config }).pipe(
            Effect.map((r) => {
              const lines: Array<string> = []
              if (r.seededBlueprintFile) lines.push(`Created ${config.blueprintFile}`)
              if (r.remodel.written.length > 0) {
                lines.push(
                  `Wrote ${r.remodel.written.length} file${r.remodel.written.length === 1 ? "" : "s"}:`,
                  ...r.remodel.written.map((p) => `  ${p}`),
                )
              }
              lines.push(
                "",
                "projitect initialized. Edit `.pjt.ts` to add blueprints, then run `pnpm pjt remodel`.",
              )
              return { output: lines.join("\n"), exitCode: 0 }
            }),
          ),
        )
      case "add": {
        const out = yield* add({ blueprint: rest[0] ?? "" })
        return { output: out, exitCode: 0 }
      }
      default:
        return {
          output: `Unknown command: ${command}\n\n${HELP_TEXT}`,
          exitCode: 1,
        }
    }
  })

const parseCliArgs = (args: ReadonlyArray<string>): WritablePartialConfig => {
  const out: WritablePartialConfig = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--project-root" && args[i + 1] !== undefined) {
      out.projectRoot = args[i + 1]!
      i++
    } else if (a === "--blueprint-file" && args[i + 1] !== undefined) {
      out.blueprintFile = args[i + 1]!
      i++
    } else if (a === "--json") {
      out.jsonOutput = true
    } else if (a === "--verbose") {
      out.verbosity = 2
    } else if (a === "--quiet") {
      out.verbosity = 0
    }
  }
  return out
}

const runWithErrorHandling = (
  eff: Effect.Effect<DispatchResult, Errors.ProjitectError>,
): Effect.Effect<DispatchResult> =>
  eff.pipe(
    Effect.match({
      onSuccess: (r) => r,
      onFailure: (err): DispatchResult => ({ output: formatError(err), exitCode: 1 }),
    }),
  )

const formatError = (err: Errors.ProjitectError): string => {
  const id = (err as { id?: string }).id ?? "unknown"
  const msg = (err as { message?: string }).message ?? String(err)
  return `Error [${id}]: ${msg}\n  See https://projitect.dev/errors/${id} or run \`pjt explain ${id}\``
}

const HELP_TEXT = `pjt — project scaffolding that stays in sync

Usage:
  pjt <command> [options]

Commands:
  init                Bootstrap projitect in the current project (creates .pjt.ts, adds pjt script)
  remodel             Apply the blueprint plan to disk (non-destructive)
  inspect             Report drift between project and blueprints (exit 1 if drift, exit 0 if clean)
  build --force       Wipe the project and rebuild from scratch (not yet implemented)
  add <blueprint>     Install a blueprint package and add it to .pjt.ts (not yet implemented)
  explain <error-id>  Print a description of an error id

Options:
  --project-root <path>     Override the project root (default: cwd)
  --blueprint-file <path>   Override the blueprint file path (default: .pjt.ts)
  --json                    Machine-readable output
  --verbose, --quiet        Verbosity controls

Docs: https://projitect.dev
`
