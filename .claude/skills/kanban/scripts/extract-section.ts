// Extract one section (Plan, Implementation notes, etc.) from a card's description.
// Fetches the card from Trello, scopes-checks the board, then prints just that section's
// content. Used by /kanban-run to pass "the approved plan" into the Builder template
// without round-tripping the entire card through the LLM.
//
// Usage: pnpm exec tsx .claude/skills/kanban/scripts/extract-section.ts <card-id> "<section-name>"
// Stdout: raw markdown of the section (no header)

import { TrelloClient } from "./lib/client.js"
import { loadEnv, loadKanbanConfig } from "./lib/config.js"
import { extractSection } from "./lib/description-schema.js"
import { die, parseArgs, runScript } from "./lib/exit.js"

async function main(): Promise<void> {
  const { positionals } = parseArgs({ options: {} })
  const cardId = positionals[0]
  const sectionName = positionals[1]
  if (!cardId || !sectionName) die('Usage: extract-section <card-id> "<section-name>"')

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

  const content = extractSection(card.desc, sectionName)
  process.stdout.write(content ? `${content}\n` : "")
}

await runScript(main)
