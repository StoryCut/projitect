// Post a signed comment on a card. The comment body is read from stdin so multi-line
// content + markdown is natural. The header (actor, model, timestamp, optional suffix)
// is generated per lib/signed-comment.ts.
//
// Usage:
//   echo "Plan complete. 3 files to modify..." | \
//     pnpm exec tsx scripts/kanban/append-signed-comment.ts \
//       --card-id ABC --actor "Planner" --model "claude-opus-4-7" \
//       [--suffix "attempt 1/3"]
//
// Output JSON: { actionId, cardId, header }

import { TrelloClient } from "./lib/client.js"
import { loadEnv, loadKanbanConfig } from "./lib/config.js"
import { die, parseArgs, printJson, readStdin, runScript } from "./lib/exit.js"
import { formatSignedComment } from "./lib/signed-comment.js"

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "card-id": { type: "string" },
      actor: { type: "string" },
      model: { type: "string" },
      suffix: { type: "string" },
    },
  })

  const cardId = values["card-id"]
  const actor = values.actor
  const model = values.model
  const suffix = values.suffix
  if (!cardId || !actor || !model)
    die(
      'Usage: append-signed-comment --card-id X --actor "Y" --model Z [--suffix "..."]  (body via stdin)',
    )

  const stdin = await readStdin()
  const body = stdin.trim()
  if (!body) die("Stdin is empty. Pipe the comment body in.")

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

  const text = formatSignedComment({ actor, model, body, suffix })
  const action = await client.addComment(cardId, text)

  printJson({
    actionId: action.id,
    cardId,
    header: text.split("\n", 1)[0],
  })
}

await runScript(main)
