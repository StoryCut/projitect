// Inverse of render-card-description. Reads markdown from stdin and emits the parsed
// CardParts as JSON on stdout. Useful when a skill wants to read the current state of a
// card (e.g. to update one section without clobbering others).
//
// Usage: pnpm exec tsx scripts/kanban/parse-card-description.ts < card-description.md

import { parseDescription } from "./lib/description-schema.js"
import { die, printJson, readStdin, runScript } from "./lib/exit.js"

async function main(): Promise<void> {
  const md = await readStdin()
  if (!md.trim()) die("Stdin is empty. Pipe in a card description (markdown).")
  printJson(parseDescription(md))
}

await runScript(main)
