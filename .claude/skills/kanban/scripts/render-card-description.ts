// Render a card description from a JSON payload, per the schema in
// lib/description-schema.ts. Used by /kanban-dump and /kanban-refine to produce the
// markdown that goes into the Trello card's `desc` field.
//
// Usage: echo '{"summary":"fix tsconfig refs"}' | \
//          pnpm exec tsx .claude/skills/kanban/scripts/render-card-description.ts
// Stdin: JSON (Partial<CardParts>)
// Stdout: markdown

import {
  renderDescription,
  type AcceptanceCriterion,
  type CardPartsInput,
} from "./lib/description-schema.js"
import { die, readStdin, runScript } from "./lib/exit.js"
import { asArray, asObject, isString, numberFrom, stringFrom } from "./lib/narrow.js"

async function main(): Promise<void> {
  const stdin = await readStdin()
  if (!stdin.trim()) die("Stdin is empty. Pipe in a JSON object.")

  let raw: unknown
  try {
    raw = JSON.parse(stdin)
  } catch (error) {
    die(`Stdin is not valid JSON: ${(error as Error).message}`)
  }

  const parts = toCardParts(raw)
  process.stdout.write(`${renderDescription(parts)}\n`)
}

function toCardParts(input: unknown): CardPartsInput {
  const obj = asObject(input)
  const metaObj = asObject(obj.meta)
  const level = stringFrom(metaObj.level)

  return {
    summary: stringFrom(obj.summary),
    acceptanceCriteria: parseAC(obj.acceptanceCriteria),
    dependsOn: asArray(obj.dependsOn).filter(isString),
    plan: stringFrom(obj.plan),
    implementationNotes: stringFrom(obj.implementationNotes),
    testResults: stringFrom(obj.testResults),
    meta: {
      level: level === "L1" || level === "L2" || level === "L3" ? level : "L2",
      planReviewAttempts: numberFrom(metaObj.planReviewAttempts) ?? 0,
      implReviewAttempts: numberFrom(metaObj.implReviewAttempts) ?? 0,
    },
  }
}

function parseAC(input: unknown): AcceptanceCriterion[] {
  const items: AcceptanceCriterion[] = []
  for (const entry of asArray(input)) {
    const o = asObject(entry)
    const text = stringFrom(o.text)
    if (!text) continue
    items.push({ checked: Boolean(o.checked), text })
  }
  return items
}

await runScript(main)
