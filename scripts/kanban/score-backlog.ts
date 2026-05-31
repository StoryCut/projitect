// Score every Backlog card per the prioritization rubric in
// .claude/skills/kanban-prioritize/SKILL.md, then output a sorted JSON array so
// /kanban-prioritize can present the current-vs-proposed diff to the human.
//
// Scoring (additive):
//   +30  priority-high label
//   +10  priority-medium label
//    +0  priority-low / unlabeled
//   +15  at least one other Backlog card depends on this card (bottleneck)
//   -10  no acceptance criteria filled in (needs refinement before planning)
//
// Usage: pnpm exec tsx scripts/kanban/score-backlog.ts
// Output JSON: [{ id, shortLink, name, score, factors, current_pos, proposed_pos,
//                 priority, hasAC, dependents }, ...] sorted by proposed order (highest first).

import { TrelloClient } from "./lib/client.js"
import { loadEnv, loadKanbanConfig } from "./lib/config.js"
import { parseDescription } from "./lib/description-schema.js"
import { printJson, runScript } from "./lib/exit.js"
import type { Card } from "./lib/types.js"

type Priority = "high" | "medium" | "low" | "none"

interface ScoreFactor {
  label: string
  delta: number
}

interface Scored {
  id: string
  shortLink: string
  name: string
  priority: Priority
  hasAC: boolean
  dependents: number
  factors: ScoreFactor[]
  score: number
  current_pos: number
  proposed_pos: number
}

async function main(): Promise<void> {
  const env = loadEnv()
  const config = loadKanbanConfig()
  const client = new TrelloClient(env)

  const [cards, labels] = await Promise.all([
    client.getCardsByList(config.lists.backlog),
    client.getLabels(config.boardId),
  ])

  const labelById = new Map(labels.map((l) => [l.id, l.name]))
  const priorityFor = (card: Card): Priority => {
    const names = new Set(card.idLabels.map((id) => labelById.get(id) ?? ""))
    if (names.has("priority-high")) return "high"
    if (names.has("priority-medium")) return "medium"
    if (names.has("priority-low")) return "low"
    return "none"
  }

  // Build dependency reverse-index: cardShortLink → count of cards depending on it.
  // Card descriptions reference deps as "#shortLink" entries in the Depends on section.
  const cardByShortLink = new Map(cards.map((c) => [c.shortLink, c]))
  const dependentCount = new Map<string, number>()
  for (const card of cards) {
    const deps = parseDescription(card.desc).dependsOn
    for (const dep of deps) {
      const shortLink = dep.replace(/^#/, "").trim()
      if (cardByShortLink.has(shortLink)) {
        dependentCount.set(shortLink, (dependentCount.get(shortLink) ?? 0) + 1)
      }
    }
  }

  const scored: Scored[] = cards.map((card, i) => {
    const priority = priorityFor(card)
    const parts = parseDescription(card.desc)
    const hasAC = parts.acceptanceCriteria.length > 0
    const dependents = dependentCount.get(card.shortLink) ?? 0

    const factors: ScoreFactor[] = []
    if (priority === "high") factors.push({ label: "priority-high", delta: 30 })
    else if (priority === "medium") factors.push({ label: "priority-medium", delta: 10 })
    if (dependents > 0) factors.push({ label: `bottleneck (${dependents} deps)`, delta: 15 })
    if (!hasAC) factors.push({ label: "no acceptance criteria", delta: -10 })

    const score = factors.reduce((sum, f) => sum + f.delta, 0)

    return {
      id: card.id,
      shortLink: card.shortLink,
      name: card.name,
      priority,
      hasAC,
      dependents,
      factors,
      score,
      current_pos: i + 1,
      proposed_pos: 0, // filled in after sort
    }
  })

  // Sort by score desc, then by current pos asc (tie-breaker keeps stable-ish order).
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.current_pos - b.current_pos)
  sorted.forEach((s, i) => {
    s.proposed_pos = i + 1
  })

  printJson(sorted)
}

await runScript(main)
