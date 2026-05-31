// Sanity-check the kanban setup. JSON report to stdout; exit 0 if all green, 1 otherwise.
//
// Usage: pnpm exec tsx .claude/skills/kanban/scripts/status-check.ts

import { existsSync } from "node:fs"
import path from "node:path"
import { TrelloClient } from "./lib/client.js"
import { findRepoRoot, loadKanbanConfig } from "./lib/config.js"
import { die, printJson, runScript } from "./lib/exit.js"
import type { KanbanConfig } from "./lib/types.js"
import { LIST_KEYS, LABEL_KEYS, LIST_DISPLAY_NAMES } from "./lib/types.js"

interface Check {
  check: string
  status: "green" | "red"
  detail: string
}

async function main(): Promise<void> {
  const checks: Check[] = []

  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  const boardIdEnv = process.env.TRELLO_BOARD_ID

  checks.push(
    {
      check: "TRELLO_API_KEY in env",
      status: apiKey ? "green" : "red",
      detail: apiKey ? "set" : "missing — see .claude/skills/kanban/SETUP.md step 2",
    },
    {
      check: "TRELLO_TOKEN in env",
      status: token ? "green" : "red",
      detail: token ? "set" : "missing — see .claude/skills/kanban/SETUP.md step 3",
    },
    {
      check: "TRELLO_BOARD_ID in env",
      status: boardIdEnv ? "green" : "red",
      detail: boardIdEnv
        ? `set to ${boardIdEnv}`
        : "missing — run /kanban-init then paste the id into .env.local",
    },
  )

  const root = findRepoRoot()
  const kanbanJsonPath = path.join(root, ".claude", "kanban.json")
  const kanbanJsonExists = existsSync(kanbanJsonPath)
  checks.push({
    check: ".claude/kanban.json exists",
    status: kanbanJsonExists ? "green" : "red",
    detail: kanbanJsonExists ? kanbanJsonPath : "missing — run /kanban-init",
  })

  if (!apiKey || !token || !kanbanJsonExists) return finish(checks)

  let config: KanbanConfig
  try {
    config = loadKanbanConfig(root)
    checks.push({
      check: ".claude/kanban.json parses + validates",
      status: "green",
      detail: `board ${config.boardId}`,
    })
  } catch (error) {
    checks.push({
      check: ".claude/kanban.json parses + validates",
      status: "red",
      detail: (error as Error).message,
    })
    return finish(checks)
  }

  if (boardIdEnv) {
    const match = boardIdEnv === config.boardId
    checks.push({
      check: "TRELLO_BOARD_ID matches kanban.json",
      status: match ? "green" : "red",
      detail: match ? "agree" : `env=${boardIdEnv} vs kanban.json=${config.boardId} — fix one`,
    })
  }

  const client = new TrelloClient({ apiKey, token, boardId: config.boardId })

  try {
    const board = await client.getBoard(config.boardId)
    checks.push({
      check: "board reachable on Trello",
      status: "green",
      detail: `${board.name} (${board.url})`,
    })
  } catch (error) {
    checks.push({
      check: "board reachable on Trello",
      status: "red",
      detail: (error as Error).message,
    })
    return finish(checks)
  }

  const lists = await client.getLists(config.boardId)
  const liveListIds = new Set(lists.map((l) => l.id))
  for (const k of LIST_KEYS) {
    const id = config.lists[k]
    const found = liveListIds.has(id)
    checks.push({
      check: `list "${LIST_DISPLAY_NAMES[k]}" resolves`,
      status: found ? "green" : "red",
      detail: found ? id : `id ${id} not found — re-run /kanban-init to reconcile`,
    })
  }

  const labels = await client.getLabels(config.boardId)
  const liveLabelIds = new Set(labels.map((l) => l.id))
  for (const k of LABEL_KEYS) {
    const id = config.labels[k]
    const found = liveLabelIds.has(id)
    checks.push({
      check: `label "${k}" resolves`,
      status: found ? "green" : "red",
      detail: found ? id : `id ${id} not found — re-run /kanban-init to reconcile`,
    })
  }

  finish(checks)
}

function finish(checks: Check[]): void {
  const allGreen = checks.every((c) => c.status === "green")
  printJson({ overall: allGreen ? "green" : "red", checks })
  if (!allGreen) die("one or more checks are red")
}

await runScript(main)
