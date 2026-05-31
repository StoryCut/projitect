// Resolve an existing board OR create a new one, then reconcile the 8 required lists and
// 3 priority labels. Emits the resulting KanbanConfig as JSON on stdout — pipe into
// write-kanban-json.ts to persist.
//
// Usage:
//   pnpm exec tsx scripts/kanban/bootstrap-board.ts --board-id ABC
//   pnpm exec tsx scripts/kanban/bootstrap-board.ts --create \
//     --name "projitect" --workspace ORG_ID --visibility private
//
// --workspace accepts an organization id or "personal" / "" for a personal board.
// --visibility: "private" (default) | "org" (workspace-visible) | "public"
//
// Output JSON:
//   { mode: "resolved" | "created", boardId, boardUrl, lists, labels,
//     created?: { lists, labels }, extras?: [...] }

import { TrelloClient, TrelloError } from "./lib/client.js"
import { loadEnv } from "./lib/config.js"
import { buildTypedRecord } from "./lib/narrow.js"
import { die, parseArgs, printJson, runScript } from "./lib/exit.js"
import type { Board, KanbanConfig, LabelKey, ListKey } from "./lib/types.js"
import { LABEL_COLORS, LABEL_KEYS, LIST_DISPLAY_NAMES, LIST_KEYS } from "./lib/types.js"

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "board-id": { type: "string" },
      create: { type: "boolean" },
      name: { type: "string" },
      workspace: { type: "string" },
      visibility: { type: "string" },
    },
  })

  const env = loadEnv()
  const client = new TrelloClient(env)

  let board: Board
  let mode: "resolved" | "created"

  if (values.create) {
    const name = values.name
    if (!name) die("--create requires --name")
    const visibility = (values.visibility ?? "private") as "private" | "org" | "public"
    if (!["private", "org", "public"].includes(visibility)) {
      die(`Invalid --visibility "${visibility}". Use private | org | public.`)
    }
    const workspace = values.workspace
    const idOrganization =
      workspace && workspace !== "personal" && workspace !== "" ? workspace : undefined
    board = await client.createBoard({ name, idOrganization, visibility })
    mode = "created"
  } else if (values["board-id"]) {
    try {
      board = await client.getBoard(values["board-id"])
      mode = "resolved"
    } catch (error) {
      if (error instanceof TrelloError && error.status === 404) {
        die(`Board ${values["board-id"]} not found. Re-run with --create to make a new one.`, 2)
      }
      throw error
    }
  } else {
    die("Provide either --board-id <id> or --create --name <name>")
  }

  // -- Reconcile lists -----------------------------------------------------
  const existingLists = await client.getLists(board.id)
  const listsByName = new Map(existingLists.map((l) => [l.name, l]))
  const createdLists: Array<{ key: ListKey; name: string; id: string }> = []
  let position = 1
  for (const k of LIST_KEYS) {
    const name = LIST_DISPLAY_NAMES[k]
    if (!listsByName.has(name)) {
      const list = await client.createList(board.id, name, position * 65_536)
      listsByName.set(name, list)
      createdLists.push({ key: k, name, id: list.id })
    }
    position++
  }
  const lists = buildTypedRecord(LIST_KEYS, (k) => {
    const l = listsByName.get(LIST_DISPLAY_NAMES[k])
    return l ? l.id : ""
  })

  const requiredListNames = new Set(LIST_KEYS.map((k) => LIST_DISPLAY_NAMES[k]))
  const extras = existingLists
    .filter((l) => !requiredListNames.has(l.name))
    .map((l) => ({ name: l.name, id: l.id }))

  // -- Reconcile labels ----------------------------------------------------
  const existingLabels = await client.getLabels(board.id)
  const labelsByName = new Map(existingLabels.map((l) => [l.name, l]))
  const createdLabels: Array<{ key: LabelKey; color: string; id: string }> = []
  for (const k of LABEL_KEYS) {
    if (!labelsByName.has(k)) {
      const label = await client.createLabel(board.id, k, LABEL_COLORS[k])
      labelsByName.set(k, label)
      createdLabels.push({ key: k, color: LABEL_COLORS[k], id: label.id })
    }
  }
  const labels = buildTypedRecord(LABEL_KEYS, (k) => {
    const l = labelsByName.get(k)
    return l ? l.id : ""
  })

  const config: KanbanConfig = {
    boardId: board.id,
    boardUrl: board.url,
    lists,
    labels,
  }

  printJson({
    mode,
    ...config,
    created: { lists: createdLists, labels: createdLabels },
    extras,
  })
}

await runScript(main)
