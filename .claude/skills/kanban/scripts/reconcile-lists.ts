// Ensure the 8 required lists exist on the board. Idempotent.
//
// Usage: pnpm exec tsx .claude/skills/kanban/scripts/reconcile-lists.ts <board-id>
//
// Output JSON: { lists: { brainDump: "id", ... }, created: [{ key, name, id }],
//                existing: [{ key, name, id }], extras: [{ name, id }] }

import { TrelloClient } from "./lib/client.js"
import { loadEnv } from "./lib/config.js"
import { buildTypedRecord } from "./lib/narrow.js"
import { die, parseArgs, printJson, runScript } from "./lib/exit.js"
import { LIST_KEYS, LIST_DISPLAY_NAMES, type ListKey, type KanbanConfig } from "./lib/types.js"

async function main(): Promise<void> {
  const { positionals } = parseArgs({ options: {} })
  const boardId = positionals[0]
  if (!boardId) die("Usage: reconcile-lists <board-id>")

  const env = loadEnv()
  const client = new TrelloClient(env)
  const existing = await client.getLists(boardId)
  const byName = new Map(existing.map((l) => [l.name, l]))

  const created: Array<{ key: ListKey; name: string; id: string }> = []
  const existingResult: Array<{ key: ListKey; name: string; id: string }> = []

  let position = 1
  // Process sequentially: Trello's position resolution depends on the order they're created.
  for (const k of LIST_KEYS) {
    const name = LIST_DISPLAY_NAMES[k]
    const found = byName.get(name)
    if (found) {
      existingResult.push({ key: k, name, id: found.id })
    } else {
      const list = await client.createList(boardId, name, position * 65_536)
      created.push({ key: k, name, id: list.id })
      byName.set(name, list)
    }
    position++
  }

  const lists: KanbanConfig["lists"] = buildTypedRecord(LIST_KEYS, (k) => {
    const entry = byName.get(LIST_DISPLAY_NAMES[k])
    return entry ? entry.id : ""
  })

  const requiredNames = new Set(LIST_KEYS.map((k) => LIST_DISPLAY_NAMES[k]))
  const extras = existing
    .filter((l) => !requiredNames.has(l.name))
    .map((l) => ({ name: l.name, id: l.id }))

  printJson({ lists, created, existing: existingResult, extras })
}

await runScript(main)
