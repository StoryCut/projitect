import { Effect, Stdio } from "effect"

/**
 * Node-backed `Stdio` Layer. We only need `args` to satisfy `Command.run`'s argv source;
 * the stdout/stderr sinks and stdin stream from `layerTest` (drain sinks + empty stream) are
 * adequate because all our output goes through `Terminal.display` and we don't currently read
 * from stdin outside the `Prompt` module (which uses `Terminal.readLine` / `Terminal.readInput`).
 */
export const StdioLive = Stdio.layerTest({
  args: Effect.succeed(process.argv.slice(2)),
})
