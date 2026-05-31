// Write .claude/kanban.json from JSON on stdin, with stable key ordering.
// If the file exists and differs from what would be written, prints diff to stderr and
// exits 2 unless --force.
//
// Usage: pnpm exec tsx scripts/kanban/write-kanban-json.ts [--force]
// Stdin: JSON shaped like { boardId, boardUrl, lists, labels } per lib/types.ts → KanbanConfig

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { findRepoRoot } from "./lib/config.js"
import { die, parseArgs, printJson, readStdin, runScript } from "./lib/exit.js"
import { asObject, buildTypedRecord, stringFrom } from "./lib/narrow.js"
import { LIST_KEYS, LABEL_KEYS, type KanbanConfig } from "./lib/types.js"

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { force: { type: "boolean" } },
  })

  const stdin = await readStdin()
  if (!stdin.trim()) die("Stdin is empty. Pipe in the kanban.json content (JSON).")

  let raw: unknown
  try {
    raw = JSON.parse(stdin)
  } catch (error) {
    die(`Stdin is not valid JSON: ${(error as Error).message}`)
  }

  const config = normalize(raw)
  validate(config)

  const root = findRepoRoot()
  const targetPath = path.join(root, ".claude", "kanban.json")
  const rendered = `${renderStable(config)}\n`

  if (existsSync(targetPath) && !values.force) {
    const existing = readFileSync(targetPath, "utf8")
    if (existing === rendered) {
      printJson({ status: "unchanged", path: targetPath })
      return
    }
    process.stderr.write(
      `Refusing to overwrite ${targetPath} (file exists and differs). ` +
        `Re-run with --force to overwrite.\n\n`,
    )
    process.stderr.write("=== existing ===\n")
    process.stderr.write(existing)
    process.stderr.write("\n=== proposed ===\n")
    process.stderr.write(rendered)
    die(`Refusing to overwrite ${targetPath} (existing file differs — diff above).`, 2)
  }

  const wasNew = !existsSync(targetPath)
  writeFileSync(targetPath, rendered)
  printJson({ status: wasNew ? "created" : "updated", path: targetPath })
}

function normalize(input: unknown): KanbanConfig {
  const obj = asObject(input)
  const listsObj = asObject(obj.lists)
  const labelsObj = asObject(obj.labels)
  return {
    boardId: stringFrom(obj.boardId) ?? "",
    boardUrl: stringFrom(obj.boardUrl) ?? "",
    lists: buildTypedRecord(LIST_KEYS, (k) => stringFrom(listsObj[k]) ?? ""),
    labels: buildTypedRecord(LABEL_KEYS, (k) => stringFrom(labelsObj[k]) ?? ""),
  }
}

function validate(c: KanbanConfig): void {
  if (!c.boardId) die("Missing boardId in input")
  for (const k of LIST_KEYS) {
    if (!c.lists[k]) die(`Missing list id for "${k}"`)
  }
  for (const k of LABEL_KEYS) {
    if (!c.labels[k]) die(`Missing label id for "${k}"`)
  }
}

function renderStable(c: KanbanConfig): string {
  const orderedLists = buildTypedRecord(LIST_KEYS, (k) => c.lists[k])
  const orderedLabels = buildTypedRecord(LABEL_KEYS, (k) => c.labels[k])
  const ordered = {
    boardId: c.boardId,
    boardUrl: c.boardUrl,
    lists: orderedLists,
    labels: orderedLabels,
  }
  return JSON.stringify(ordered, null, 2)
}

await runScript(main)
