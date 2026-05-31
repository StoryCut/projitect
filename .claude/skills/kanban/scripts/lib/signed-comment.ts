// Signed-comment format — one place for the template so it can't drift across skills.
// Spec lives in .claude/skills/kanban/shared.md → Signed-comment format.

export interface SignedCommentOpts {
  actor: string // "Planner" | "Critic" | "Human decision" | "/kanban-triage" | etc.
  model: string // "claude-opus-4-7" for agents, "human" for human-driven actions
  body: string
  // `| undefined` is intentional — exactOptionalPropertyTypes wants optional fields to
  // accept explicit undefined when callers may pass it through from CLI args.
  suffix?: string | undefined
  timestamp?: Date | undefined
}

export function formatSignedComment(opts: SignedCommentOpts): string {
  const ts = (opts.timestamp ?? new Date()).toISOString()
  const suffix = opts.suffix ? ` · ${opts.suffix}` : ""
  return `> **${opts.actor}** · ${opts.model} · ${ts}${suffix}\n\n${opts.body}`
}
