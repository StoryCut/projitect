import { Effect, Terminal } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import type { Errors, ProjitectConfig } from "@projitect/core"
import { inspect } from "./inspect.js"
import { remodel } from "./remodel.js"
import { build } from "./build.js"
import { init } from "./init.js"
import { explain } from "./explain.js"
import { add } from "./add.js"
import { parseEnv, resolveConfig } from "../config-cascade.js"

/**
 * Per-handler error renderer. Catches our typed `ProjitectError` union and writes a
 * consistent `Error [id]: message` line plus the docs URL / explain hint. Sets
 * `process.exitCode = 1` so the CLI exits non-zero. Returns void so the handler chain stays
 * happy.
 */
const reportError = (err: Errors.ProjitectError): Effect.Effect<void, never, Terminal.Terminal> =>
  Effect.gen(function* () {
    const id = (err as { id?: string }).id ?? "unknown"
    const message = (err as { message?: string }).message ?? String(err)
    yield* display(`Error [${id}]: ${message}\n`)
    yield* display(`  See https://projitect.dev/errors/${id} or run \`pjt explain ${id}\`\n`)
    process.exitCode = 1
  })

const display = (text: string): Effect.Effect<void, never, Terminal.Terminal> =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal
    // best-effort write; PlatformError on display is non-actionable from a handler
    yield* Effect.ignore(terminal.display(text))
  })

const configFromEnv = (): ProjitectConfig.ProjitectConfig =>
  resolveConfig({
    env: parseEnv(process.env),
    cliArgs: { projectRoot: process.cwd() },
  })

// ---------------------------------------------------------------------------
// pjt init
// ---------------------------------------------------------------------------

const initCmd = Command.make("init", {}, () =>
  Effect.gen(function* () {
    const config = configFromEnv()
    const result = yield* init({ config }).pipe(
      Effect.matchEffect({
        onSuccess: (r) => Effect.succeed(r),
        onFailure: (err: Errors.ProjitectError) =>
          reportError(err).pipe(Effect.as(null)),
      }),
    )
    if (result === null) return
    const lines: Array<string> = []
    if (result.seededBlueprintFile) lines.push(`Created ${config.blueprintFile}`)
    if (result.remodel.written.length > 0) {
      lines.push(
        `Wrote ${result.remodel.written.length} file${result.remodel.written.length === 1 ? "" : "s"}:`,
        ...result.remodel.written.map((p) => `  ${p}`),
      )
    }
    lines.push(
      "",
      "projitect initialized. Edit `.pjt.ts` to add blueprints, then run `pnpm pjt remodel`.",
    )
    yield* display(`${lines.join("\n")}\n`)
  }),
).pipe(Command.withDescription("Bootstrap projitect in the current project."))

// ---------------------------------------------------------------------------
// pjt remodel
// ---------------------------------------------------------------------------

const remodelCmd = Command.make("remodel", {}, () =>
  Effect.gen(function* () {
    const config = configFromEnv()
    const result = yield* remodel({ config }).pipe(
      Effect.matchEffect({
        onSuccess: (r) => Effect.succeed(r),
        onFailure: (err: Errors.ProjitectError) =>
          reportError(err).pipe(Effect.as(null)),
      }),
    )
    if (result === null) return
    const parts: Array<string> = []
    if (result.written.length > 0) {
      parts.push(
        `Wrote ${result.written.length} file${result.written.length === 1 ? "" : "s"}:`,
        ...result.written.map((p) => `  ${p}`),
      )
    }
    if (result.removed.length > 0) {
      parts.push(
        `Cleaned up ${result.removed.length} orphan${result.removed.length === 1 ? "" : "s"}:`,
        ...result.removed.map((p) => `  ${p}`),
      )
    }
    if (parts.length === 0) parts.push("Project already in sync. No changes written.")
    yield* display(`${parts.join("\n")}\n`)
  }),
).pipe(
  Command.withDescription(
    "Apply the blueprint plan to disk (non-destructive). Adds + updates + removes orphan claims.",
  ),
)

// ---------------------------------------------------------------------------
// pjt inspect
// ---------------------------------------------------------------------------

const inspectCmd = Command.make(
  "inspect",
  {
    json: Flag.boolean("json").pipe(
      Flag.withDescription("Emit machine-readable JSON output (v0.1.1, currently same as text)"),
    ),
  },
  () =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* inspect({ config }).pipe(
        Effect.matchEffect({
        onSuccess: (r) => Effect.succeed(r),
        onFailure: (err: Errors.ProjitectError) =>
          reportError(err).pipe(Effect.as(null)),
      }),
      )
      if (result === null) return
      yield* display(`${result.output}\n`)
      if (result.hasDrift) process.exitCode = 1
    }),
).pipe(
  Command.withDescription(
    "Report drift between project and blueprints (exit 1 on drift; built for CI).",
  ),
)

// ---------------------------------------------------------------------------
// pjt build --force
// ---------------------------------------------------------------------------

const buildCmd = Command.make(
  "build",
  {
    force: Flag.boolean("force").pipe(
      Flag.withDescription("Required. Wipe the project tree and rebuild from scratch."),
    ),
    forceDirty: Flag.boolean("force-dirty").pipe(
      Flag.withDescription("Allow wiping even when git has uncommitted changes."),
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withDescription("Skip the interactive confirmation prompt."),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const config = configFromEnv()
      const result = yield* build({
        config,
        force: input.force,
        forceDirty: input.forceDirty,
        yes: input.yes,
      }).pipe(
        Effect.matchEffect({
          onSuccess: (r) => Effect.succeed(r),
          onFailure: (err) => {
            // QuitError from Prompt = user pressed Ctrl-C; treat as graceful cancel.
            const known = (err as { id?: string }).id
            if (!known) {
              process.exitCode = 130
              return display("Cancelled.\n").pipe(Effect.as(null))
            }
            return reportError(err as Errors.ProjitectError).pipe(Effect.as(null))
          },
        }),
      )
      if (result === null) return
      const lines: Array<string> = []
      if (result.wiped.length === 0 && result.remodel.written.length === 0) {
        lines.push("Cancelled. No changes made.")
      } else {
        if (result.wiped.length > 0) {
          lines.push(
            `Wiped ${result.wiped.length} entr${result.wiped.length === 1 ? "y" : "ies"}:`,
            ...result.wiped.map((p) => `  ${p}`),
          )
        }
        if (result.remodel.written.length > 0) {
          lines.push(
            `Rebuilt ${result.remodel.written.length} file${result.remodel.written.length === 1 ? "" : "s"} from the plan:`,
            ...result.remodel.written.map((p) => `  ${p}`),
          )
        }
      }
      yield* display(`${lines.join("\n")}\n`)
    }),
).pipe(
  Command.withDescription(
    "Scratch-build the project from blueprints. Destructive — requires --force and clean git.",
  ),
)

// ---------------------------------------------------------------------------
// pjt explain <error-id>
// ---------------------------------------------------------------------------

const explainCmd = Command.make(
  "explain",
  { errorId: Argument.string("error-id") },
  (input) =>
    Effect.gen(function* () {
      const out = yield* explain({ errorId: input.errorId })
      yield* display(`${out}\n`)
    }),
).pipe(Command.withDescription("Print a description of a projitect error id."))

// ---------------------------------------------------------------------------
// pjt add <package>
// ---------------------------------------------------------------------------

const addCmd = Command.make(
  "add",
  {
    pkg: Argument.string("package"),
    section: Flag.string("section").pipe(
      Flag.optional,
      Flag.withDescription(
        "Comma-separated section names for blueprint-set packages (e.g. `--section macOs,node`).",
      ),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const out = yield* add({ blueprint: input.pkg })
      yield* display(`${out}\n`)
    }),
).pipe(
  Command.withDescription(
    "Install a blueprint package and add it to .pjt.ts (full impl in v0.1.x).",
  ),
)

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export const rootCommand = Command.make("pjt").pipe(
  Command.withDescription("Project scaffolding that stays in sync — drift-aware blueprints."),
  Command.withSubcommands([initCmd, remodelCmd, inspectCmd, buildCmd, explainCmd, addCmd]),
)

export type RootCommand = typeof rootCommand
