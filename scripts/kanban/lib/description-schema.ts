// Render / parse / extract for the card description schema.
// Spec lives in .claude/skills/kanban/shared.md → Card description schema.

export interface AcceptanceCriterion {
  checked: boolean
  text: string
}

export interface CardParts {
  summary: string
  acceptanceCriteria: AcceptanceCriterion[]
  dependsOn: string[] // e.g. ["#42", "#87"]
  plan: string
  implementationNotes: string
  testResults: string
  meta: {
    level: "L1" | "L2" | "L3"
    planReviewAttempts: number
    implReviewAttempts: number
  }
}

export const EMPTY_PARTS: CardParts = {
  summary: "",
  acceptanceCriteria: [],
  dependsOn: [],
  plan: "_not planned yet_",
  implementationNotes: "_not implemented yet_",
  testResults: "_not tested yet_",
  meta: {
    level: "L2",
    planReviewAttempts: 0,
    implReviewAttempts: 0,
  },
}

export const SECTION_NAMES = [
  "Summary",
  "Acceptance criteria",
  "Depends on",
  "Plan",
  "Implementation notes",
  "Test results",
  "Meta",
] as const

// Looser than Partial<CardParts> — accepts explicit undefined for callers that build the
// input from optional CLI args (exactOptionalPropertyTypes interaction).
export type CardPartsInput = {
  [K in keyof CardParts]?: CardParts[K] | undefined
}

export function renderDescription(parts: CardPartsInput): string {
  const p: CardParts = {
    summary: parts.summary ?? EMPTY_PARTS.summary,
    acceptanceCriteria: parts.acceptanceCriteria ?? EMPTY_PARTS.acceptanceCriteria,
    dependsOn: parts.dependsOn ?? EMPTY_PARTS.dependsOn,
    plan: parts.plan ?? EMPTY_PARTS.plan,
    implementationNotes: parts.implementationNotes ?? EMPTY_PARTS.implementationNotes,
    testResults: parts.testResults ?? EMPTY_PARTS.testResults,
    meta: { ...EMPTY_PARTS.meta, ...parts.meta },
  }

  const acLines =
    p.acceptanceCriteria.length > 0
      ? p.acceptanceCriteria.map((c) => `- [${c.checked ? "x" : " "}] ${c.text}`).join("\n")
      : "- [ ] <empty>"

  const depsLines = p.dependsOn.length > 0 ? p.dependsOn.map((d) => `- ${d}`).join("\n") : "- none"

  return [
    "## Summary",
    p.summary || "<empty — fill in during refine>",
    "",
    "## Acceptance criteria",
    acLines,
    "",
    "## Depends on",
    depsLines,
    "",
    "## Plan",
    p.plan,
    "",
    "## Implementation notes",
    p.implementationNotes,
    "",
    "## Test results",
    p.testResults,
    "",
    "## Meta",
    `- level: ${p.meta.level}`,
    `- plan_review_attempts: ${p.meta.planReviewAttempts}`,
    `- impl_review_attempts: ${p.meta.implReviewAttempts}`,
  ].join("\n")
}

export function parseDescription(md: string): CardParts {
  const sections = splitSections(md)
  return {
    summary: cleanPlaceholder(sections.Summary ?? ""),
    acceptanceCriteria: parseACList(sections["Acceptance criteria"] ?? ""),
    dependsOn: parseDependsList(sections["Depends on"] ?? ""),
    plan: (sections.Plan ?? "").trim(),
    implementationNotes: (sections["Implementation notes"] ?? "").trim(),
    testResults: (sections["Test results"] ?? "").trim(),
    meta: parseMeta(sections.Meta ?? ""),
  }
}

export function extractSection(md: string, name: string): string {
  const sections = splitSections(md)
  return (sections[name] ?? "").trim()
}

function splitSections(md: string): Record<string, string> {
  const sections: Record<string, string> = {}
  let currentName: string | undefined
  let currentLines: string[] = []
  for (const line of md.split("\n")) {
    const match = line.match(/^##\s+(.+)$/)
    if (match) {
      if (currentName) sections[currentName] = currentLines.join("\n")
      currentName = match[1].trim()
      currentLines = []
    } else if (currentName) {
      currentLines.push(line)
    }
  }
  if (currentName) sections[currentName] = currentLines.join("\n")
  return sections
}

function cleanPlaceholder(text: string): string {
  const trimmed = text.trim()
  if (/^<.*>$/.test(trimmed)) return ""
  return trimmed
}

function parseACList(text: string): AcceptanceCriterion[] {
  const items: AcceptanceCriterion[] = []
  for (const line of text.split("\n")) {
    const m = line.match(/^-\s+\[([x ])\]\s+(.+)$/)
    if (m && !/^<.*>$/.test(m[2].trim())) {
      items.push({ checked: m[1] === "x", text: m[2].trim() })
    }
  }
  return items
}

function parseDependsList(text: string): string[] {
  const items: string[] = []
  for (const line of text.split("\n")) {
    const m = line.match(/^-\s+(.+)$/)
    if (m && m[1].trim().toLowerCase() !== "none") items.push(m[1].trim())
  }
  return items
}

function parseMeta(text: string): CardParts["meta"] {
  const meta = { ...EMPTY_PARTS.meta }
  for (const line of text.split("\n")) {
    const m = line.match(/^-\s+([\w_]+):\s*(.+)$/)
    if (!m) continue
    const key = m[1]
    const val = m[2].trim()
    if (key === "level" && (val === "L1" || val === "L2" || val === "L3")) {
      meta.level = val
    } else if (key === "plan_review_attempts") {
      meta.planReviewAttempts = Number.parseInt(val, 10) || 0
    } else if (key === "impl_review_attempts") {
      meta.implReviewAttempts = Number.parseInt(val, 10) || 0
    }
  }
  return meta
}
