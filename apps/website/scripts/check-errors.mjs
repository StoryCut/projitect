#!/usr/bin/env node
/**
 * CI gate: every error id exported by @projitect/core must have a matching MDX page under
 * src/content/docs/errors/. Run via `pnpm --filter website check:errors`.
 *
 * On failure, prints which ids lack a page (or, conversely, which orphan pages have no id).
 */
import { ERROR_IDS } from "@projitect/core/errors"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const errorsDir = path.resolve(__dirname, "../src/content/docs/errors")

const ids = new Set(ERROR_IDS)
const files = await fs.readdir(errorsDir).catch(() => [])
const fileIds = new Set(
  files.filter((f) => f.endsWith(".mdx") && f !== "index.mdx").map((f) => f.replace(/\.mdx$/, "")),
)

const missing = [...ids].filter((id) => !fileIds.has(id))
const orphan = [...fileIds].filter((id) => !ids.has(id))

if (missing.length > 0) {
  console.error("Missing MDX pages for error ids:")
  for (const id of missing) console.error(`  - ${id}`)
}
if (orphan.length > 0) {
  console.error("Orphan MDX pages (no matching error id):")
  for (const id of orphan) console.error(`  - ${id}`)
}

if (missing.length > 0 || orphan.length > 0) {
  console.error(
    `\n${missing.length + orphan.length} mismatch(es). Add an MDX page for each missing id, or remove orphan pages.`,
  )
  process.exit(1)
}

console.log(`All ${ids.size} error ids have matching MDX pages.`)
