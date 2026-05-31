// Exit 0 if the given card belongs to the configured board, nonzero otherwise.
// Used as defense-in-depth by every mutating script (Trello tokens are account-wide).
//
// Usage: pnpm exec tsx .claude/skills/kanban/scripts/board-scope-guard.ts <card-id>

import { TrelloClient } from "./lib/client.js"
import { loadEnv, loadKanbanConfig } from "./lib/config.js"
import { die, parseArgs, runScript } from "./lib/exit.js"

async function main(): Promise<void> {
  const { positionals } = parseArgs({ options: {} })
  const cardId = positionals[0]
  if (!cardId) die("Usage: board-scope-guard <card-id>")

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
  // Silent success — exit 0.
}

await runScript(main)
