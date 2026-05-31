// Ensure the 3 priority labels exist on the board. Idempotent.
//
// Usage: pnpm exec tsx scripts/kanban/reconcile-labels.ts <board-id>
//
// Output JSON: { labels: { "priority-high": "id", ... }, created: [...], existing: [...] }

import { TrelloClient } from "./lib/client.js"
import { loadEnv } from "./lib/config.js"
import { buildTypedRecord } from "./lib/narrow.js"
import { die, parseArgs, printJson, runScript } from "./lib/exit.js"
import { LABEL_KEYS, LABEL_COLORS, type LabelKey, type KanbanConfig } from "./lib/types.js"

async function main(): Promise<void> {
  const { positionals } = parseArgs({ options: {} })
  const boardId = positionals[0]
  if (!boardId) die("Usage: reconcile-labels <board-id>")

  const env = loadEnv()
  const client = new TrelloClient(env)
  const existing = await client.getLabels(boardId)
  const byName = new Map(existing.map((l) => [l.name, l]))

  const created: Array<{ key: LabelKey; color: string; id: string }> = []
  const existingResult: Array<{ key: LabelKey; id: string }> = []

  for (const k of LABEL_KEYS) {
    const found = byName.get(k)
    if (found) {
      existingResult.push({ key: k, id: found.id })
    } else {
      const label = await client.createLabel(boardId, k, LABEL_COLORS[k])
      created.push({ key: k, color: LABEL_COLORS[k], id: label.id })
      byName.set(k, label)
    }
  }

  const labels: KanbanConfig["labels"] = buildTypedRecord(LABEL_KEYS, (k) => {
    const entry = byName.get(k)
    return entry ? entry.id : ""
  })

  printJson({ labels, created, existing: existingResult })
}

await runScript(main)
