// Shared types + constants for the kanban scripts.
// The Trello API response shapes are intentionally minimal — only the fields we read.

export type ListKey =
  | "brainDump"
  | "backlog"
  | "plan"
  | "planReview"
  | "impl"
  | "implReview"
  | "test"
  | "done"

export const LIST_KEYS: readonly ListKey[] = [
  "brainDump",
  "backlog",
  "plan",
  "planReview",
  "impl",
  "implReview",
  "test",
  "done",
]

export const LIST_DISPLAY_NAMES: Record<ListKey, string> = {
  brainDump: "Brain Dump",
  backlog: "Backlog",
  plan: "Plan",
  planReview: "Plan Review",
  impl: "Impl",
  implReview: "Impl Review",
  test: "Test",
  done: "Done",
}

export function isListKey(s: string): s is ListKey {
  return (LIST_KEYS as readonly string[]).includes(s)
}

export function listKeyByDisplayName(name: string): ListKey | undefined {
  for (const k of LIST_KEYS) {
    if (LIST_DISPLAY_NAMES[k] === name) return k
  }
  return undefined
}

export type LabelKey = "priority-high" | "priority-medium" | "priority-low"

export const LABEL_KEYS: readonly LabelKey[] = ["priority-high", "priority-medium", "priority-low"]

export const LABEL_COLORS: Record<LabelKey, string> = {
  "priority-high": "red",
  "priority-medium": "yellow",
  "priority-low": "sky",
}

export interface KanbanConfig {
  boardId: string
  boardUrl: string
  lists: Record<ListKey, string>
  labels: Record<LabelKey, string>
}

// Trello API response shapes — minimal, only what we consume.

export interface Board {
  id: string
  name: string
  url: string
  shortUrl: string
  idOrganization: string | null
  prefs?: { permissionLevel: string }
}

export interface TrelloList {
  id: string
  name: string
  pos: number
  closed: boolean
  idBoard: string
}

export interface Label {
  id: string
  name: string
  color: string | null
  idBoard: string
}

export interface Card {
  id: string
  name: string
  desc: string
  idList: string
  idBoard: string
  idLabels: string[]
  pos: number
  closed: boolean
  shortUrl: string
  shortLink: string
  dateLastActivity: string
}

export interface CommentAction {
  id: string
  type: "commentCard"
  date: string
  data: { text: string }
  memberCreator: { id: string; fullName: string; username: string }
}

export interface Organization {
  id: string
  name: string
  displayName: string
}
