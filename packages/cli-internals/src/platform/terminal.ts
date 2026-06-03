import * as readline from "node:readline/promises"
import { Effect, Layer, Terminal } from "effect"
import * as PlatformError from "effect/PlatformError"

/**
 * Node-backed `Terminal` Layer.
 *
 * - `columns` / `rows` read from `process.stdout` (fall back to sensible defaults when not a TTY)
 * - `display(text)` writes to `process.stdout` synchronously
 * - `readLine` uses `node:readline/promises` so `Prompt.text` and `Prompt.confirm` work
 * - `readInput` (the low-level keypress stream used by `Prompt.select` / `Prompt.multiSelect`) is
 *   not implemented in v0.1. Until we ship interactive multi-select prompts, the only consumer
 *   that would call it is wizard mode. The Effect returned fails clearly if exercised.
 */
const make = Terminal.make({
  // @types/node types columns/rows as non-nullable, but they're undefined on non-TTY stdout.
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  columns: Effect.sync(() => process.stdout.columns ?? 80),
  rows: Effect.sync(() => process.stdout.rows ?? 24),
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  display: (text) =>
    Effect.try({
      try: () => {
        process.stdout.write(text)
      },
      catch: (cause) =>
        PlatformError.badArgument({
          module: "Terminal",
          method: "display",
          description: cause instanceof Error ? cause.message : String(cause),
        }),
    }),
  readLine: Effect.tryPromise({
    try: async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      try {
        return await rl.question("")
      } finally {
        rl.close()
      }
    },
    catch: () => new Terminal.QuitError({}),
  }),
  readInput: Effect.die(
    "Terminal.readInput is not implemented in the projitect Node Layer (v0.1). " +
      "Interactive multi-select prompts will land alongside `pjt add` polish.",
  ),
})

export const TerminalLive: Layer.Layer<Terminal.Terminal> = Layer.succeed(Terminal.Terminal, make)
