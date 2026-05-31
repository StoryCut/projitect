// Render a card for human reading — name, current list, labels, acceptance-criteria
// progress, dependencies, and the last N comments (default 3).
//
// Usage: pnpm exec tsx .claude/skills/kanban/scripts/card-summary.ts <card-id> [--comments N]
// Stdout: human-readable text

import { TrelloClient } from "./lib/client.js"
import { loadEnv, loadKanbanConfig } from "./lib/config.js"
import { parseDescription } from "./lib/description-schema.js"
import { die, parseArgs, printText, runScript } from "./lib/exit.js"
import { LIST_DISPLAY_NAMES, type ListKey } from "./lib/types.js"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: { comments: { type: "string" } },
  })
  const cardId = positionals[0]
  if (!cardId) die("Usage: card-summary <card-id> [--comments N]")
  const commentLimit = Number.parseInt(values.comments ?? "3", 10)

  const env = loadEnv()
  const config = loadKanbanConfig()
  const client = new TrelloClient(env)

  const [card, labels, lists] = await Promise.all([
    client.getCard(cardId),
    client.getLabels(config.boardId),
    client.getLists(config.boardId),
  ])

  if (card.idBoard !== config.boardId) {
    die(
      `BOARD-SCOPE VIOLATION: card ${cardId} is on board ${card.idBoard}, ` +
        `but kanban.json says we're operating on ${config.boardId}.`,
      3,
    )
  }

  const listName = lists.find((l) => l.id === card.idList)?.name ?? `(unknown list ${card.idList})`
  const listKey = listKeyFromName(listName, config.lists)
  const labelMap = new Map(labels.map((l) => [l.id, l]))
  const labelNames = card.idLabels.map((id) => labelMap.get(id)?.name ?? id).filter(Boolean)

  const parts = parseDescription(card.desc)
  const acDone = parts.acceptanceCriteria.filter((c) => c.checked).length
  const acTotal = parts.acceptanceCriteria.length

  const lines: string[] = []
  lines.push(
    `#${card.shortLink} ${card.name}`,
    `  url:    ${card.shortUrl}`,
    `  list:   ${listName}${listKey && listKey !== listName ? ` (${listKey})` : ""}`,
  )
  if (labelNames.length > 0) lines.push(`  labels: ${labelNames.join(", ")}`)
  if (parts.summary) lines.push(`  summary: ${truncate(parts.summary, 120)}`)
  lines.push(`  AC:     ${acDone}/${acTotal}`)
  if (parts.dependsOn.length > 0) lines.push(`  deps:   ${parts.dependsOn.join(", ")}`)
  lines.push(`  level:  ${parts.meta.level}`)

  if (commentLimit > 0) {
    const actions = await client.getCardActions(cardId, "commentCard", commentLimit)
    if (actions.length === 0) {
      lines.push("", "  (no comments)")
    } else {
      lines.push("", `  --- last ${actions.length} comment(s) ---`)
      for (const a of actions) {
        const ts = a.date.slice(0, 19).replace("T", " ")
        lines.push(`  [${ts}] ${a.memberCreator.username}:`)
        for (const line of a.data.text.split("\n")) lines.push(`    ${line}`)
      }
    }
  }

  printText(lines.join("\n"))
}

function listKeyFromName(
  displayName: string,
  configLists: Record<ListKey, string>,
): ListKey | undefined {
  for (const [k, _id] of Object.entries(configLists)) {
    const key = k as ListKey
    if (LIST_DISPLAY_NAMES[key] === displayName) return key
  }
  return undefined
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

await runScript(main)
