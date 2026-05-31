// Loads .claude/kanban.json (+ optional .claude/kanban.local.json override) and env vars.

import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { die } from "./exit.js"
import { asObject, buildTypedRecord, stringFrom } from "./narrow.js"
import { LIST_KEYS, LABEL_KEYS } from "./types.js"
import type { KanbanConfig } from "./types.js"

export interface Env {
  apiKey: string
  token: string
  boardId: string | undefined
}

export function loadEnv(): Env {
  const apiKey = process.env.TRELLO_API_KEY
  const token = process.env.TRELLO_TOKEN
  if (!apiKey) die("TRELLO_API_KEY is not set. See .claude/skills/kanban/SETUP.md.", 2)
  if (!token) die("TRELLO_TOKEN is not set. See .claude/skills/kanban/SETUP.md.", 2)
  return {
    apiKey,
    token,
    boardId: process.env.TRELLO_BOARD_ID || undefined,
  }
}

// Walks up from this script's location to find the repo root (.git or pnpm-workspace.yaml).
// Anchors on the script's location, not cwd, so scripts work no matter where they're invoked.
// Starts from this file's directory so the walk-up loop handles any depth — robust to
// future file moves.
export function findRepoRoot(start?: string): string {
  const begin = start ?? path.dirname(fileURLToPath(import.meta.url))
  let dir = begin
  while (true) {
    if (existsSync(path.join(dir, ".git")) || existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir)
      die("Could not find repo root (no .git or pnpm-workspace.yaml in any parent directory).", 2)
    dir = parent
  }
}

export function loadKanbanConfig(repoRoot?: string): KanbanConfig {
  const root = repoRoot ?? findRepoRoot()
  const mainPath = path.join(root, ".claude", "kanban.json")
  if (!existsSync(mainPath)) die(`Missing ${mainPath}. Run /kanban-init.`, 2)

  let mainRaw: unknown
  try {
    mainRaw = JSON.parse(readFileSync(mainPath, "utf8"))
  } catch (error) {
    die(`Failed to parse ${mainPath}: ${(error as Error).message}`, 2)
  }

  const localPath = path.join(root, ".claude", "kanban.local.json")
  let localRaw: unknown = {}
  if (existsSync(localPath)) {
    try {
      localRaw = JSON.parse(readFileSync(localPath, "utf8"))
    } catch (error) {
      die(`Failed to parse ${localPath}: ${(error as Error).message}`, 2)
    }
  }

  const config = mergeConfigs(mainRaw, localRaw)
  validateConfig(config, mainPath)
  return config
}

function mergeConfigs(mainRaw: unknown, localRaw: unknown): KanbanConfig {
  const main = asObject(mainRaw)
  const local = asObject(localRaw)
  const mainLists = asObject(main.lists)
  const localLists = asObject(local.lists)
  const mainLabels = asObject(main.labels)
  const localLabels = asObject(local.labels)

  return {
    boardId: stringFrom(local.boardId) ?? stringFrom(main.boardId) ?? "",
    boardUrl: stringFrom(local.boardUrl) ?? stringFrom(main.boardUrl) ?? "",
    lists: buildTypedRecord(
      LIST_KEYS,
      (k) => stringFrom(localLists[k]) ?? stringFrom(mainLists[k]) ?? "",
    ),
    labels: buildTypedRecord(
      LABEL_KEYS,
      (k) => stringFrom(localLabels[k]) ?? stringFrom(mainLabels[k]) ?? "",
    ),
  }
}

function validateConfig(c: KanbanConfig, sourcePath: string): void {
  if (!c.boardId) die(`${sourcePath}: missing or empty boardId`, 2)
  for (const k of LIST_KEYS) {
    if (!c.lists[k]) die(`${sourcePath}: missing list id for "${k}"`, 2)
  }
  for (const k of LABEL_KEYS) {
    if (!c.labels[k]) die(`${sourcePath}: missing label id for "${k}"`, 2)
  }
}
