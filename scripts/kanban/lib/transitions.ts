// Status transition matrix — what each column can move to.
// Keep in sync with .claude/skills/kanban/shared.md → Status transition matrix.
// Self-transitions (e.g. backlog → backlog for re-ranking) and archival are not modeled here
// — they're separate operations (update pos / archiveCard).

import type { ListKey } from "./types.js"

export const TRANSITIONS: Record<ListKey, readonly ListKey[]> = {
  brainDump: ["backlog"],
  backlog: ["plan"],
  plan: ["planReview", "backlog"],
  planReview: ["impl", "plan", "backlog"],
  impl: ["implReview", "plan", "backlog"],
  implReview: ["test", "impl"],
  test: ["done", "impl"],
  done: [],
}

export function isValidTransition(from: ListKey, to: ListKey): boolean {
  return TRANSITIONS[from].includes(to)
}

export function transitionsFrom(from: ListKey): readonly ListKey[] {
  return TRANSITIONS[from]
}
