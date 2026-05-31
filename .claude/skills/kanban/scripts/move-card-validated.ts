// Move a card to another list, validating the transition against the matrix in
// lib/transitions.ts. Refuses invalid moves with exit code 3. On success, also appends a
// "Human decision" signed comment so the move and audit-trail are atomic.
//
// Usage: pnpm exec tsx .claude/skills/kanban/scripts/move-card-validated.ts \
//          --card-id ABC --to <listKey> [--notes "..."] \
//          [--actor "Human decision"] [--model "human"]
//
// Output JSON: { cardId, from, to, actionId }

import { TrelloClient } from "./lib/client.js"
import { loadEnv, loadKanbanConfig } from "./lib/config.js"
import { die, parseArgs, printJson, runScript } from "./lib/exit.js"
import { formatSignedComment } from "./lib/signed-comment.js"
import { isValidTransition, transitionsFrom } from "./lib/transitions.js"
import { isListKey, LIST_DISPLAY_NAMES, type ListKey } from "./lib/types.js"

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "card-id": { type: "string" },
      to: { type: "string" },
      notes: { type: "string" },
      actor: { type: "string" },
      model: { type: "string" },
    },
  })

  const cardId = values["card-id"]
  const to = values.to
  if (!cardId || !to) die('Usage: move-card-validated --card-id X --to <listKey> [--notes "..."]')
  if (!isListKey(to))
    die(
      `Invalid --to value "${to}". Must be one of: brainDump, backlog, plan, planReview, impl, implReview, test, done.`,
    )

  const env = loadEnv()
  const config = loadKanbanConfig()
  const client = new TrelloClient(env)

  const card = await client.getCard(cardId)
  if (card.idBoard !== config.boardId) {
    die(
      `BOARD-SCOPE VIOLATION: card ${cardId} is on board ${card.idBoard}, ` +
        `but kanban.json says we're operating on ${config.boardId}.`,
      3,
    )
  }

  const fromKey = listKeyByListId(config.lists, card.idList)
  if (!fromKey)
    die(`Card ${cardId} is on list ${card.idList}, which is not one of the 8 managed lists.`, 3)

  if (fromKey === to) {
    printJson({ cardId, from: fromKey, to, actionId: null, note: "already on target list" })
    return
  }

  if (!isValidTransition(fromKey, to)) {
    die(
      `Refusing invalid transition ${fromKey} → ${to}. ` +
        `Valid targets from ${fromKey}: ${transitionsFrom(fromKey).join(", ") || "(none)"}.`,
      3,
    )
  }

  await client.moveCard(cardId, config.lists[to])

  const actor = values.actor ?? "Human decision"
  const model = values.model ?? "human"
  const body = (values.notes ?? "Approved.").trim()
  const text = formatSignedComment({
    actor,
    model,
    body,
    suffix: `${LIST_DISPLAY_NAMES[fromKey]} → ${LIST_DISPLAY_NAMES[to]}`,
  })
  const action = await client.addComment(cardId, text)

  printJson({ cardId, from: fromKey, to, actionId: action.id })
}

function listKeyByListId(lists: Record<ListKey, string>, id: string): ListKey | undefined {
  for (const [key, value] of Object.entries(lists)) {
    if (value === id && isListKey(key)) return key
  }
  return undefined
}

await runScript(main)
