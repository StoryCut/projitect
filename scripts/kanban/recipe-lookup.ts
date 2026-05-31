// Print the canned recipe for a /kanban-help bucket/intent selection. Recipes live here
// (single source of truth) rather than being duplicated across the SKILL.md files;
// keep them in sync with docs/kanban/workflows.md.
//
// Usage: pnpm exec tsx scripts/kanban/recipe-lookup.ts <bucket> <intent>
//
// Buckets + intents:
//   capture    just-save | pushback-first | during-task
//   backlog    process-dump | reprank | refine-card
//   implement  cold | from-backlog | mid-pipeline
//   setup      first-time | sanity-check | broken
//
// Output: markdown the LLM can show directly to the user.

import { die, parseArgs, printText, runScript } from "./lib/exit.js"

interface Recipe {
  title: string
  workflowsSection: string // anchor in docs/kanban/workflows.md
  commands: string[]
  notes?: string
}

const RECIPES: Record<string, Recipe> = {
  // -- capture ----------------------------------------------------------------
  "capture/just-save": {
    title: "Dump now, refine later",
    workflowsSection: "#3-dump-now-refine-later-youre-mid-flow-and-dont-want-to-lose-the-thought",
    commands: ['/kanban-dump "<idea>"'],
    notes: "One shot, no follow-up questions. Refinement happens at triage time.",
  },
  "capture/pushback-first": {
    title: "Grill, then dump",
    workflowsSection: "#2-grill-then-dump-you-have-a-half-formed-thought",
    commands: ["/grill-me", "# (when grilling proposes the dump:)", '/kanban-dump "<thesis>"'],
    notes:
      'If grilling concludes "discard — not worth pursuing", skip the dump. The point was to know that.',
  },
  "capture/during-task": {
    title: "Capture from inside another task",
    workflowsSection: "#4-capture-from-inside-a-claude-code-session-you-didnt-plan-to-capture-from",
    commands: ['/kanban-dump "<idea>"  # without breaking your current flow'],
    notes:
      "Claude can also dump on your behalf when you mention something in passing. You'll see one line of confirmation, then the original task continues.",
  },

  // -- backlog ----------------------------------------------------------------
  "backlog/process-dump": {
    title: "Process the Brain Dump column",
    workflowsSection: "#5-process-the-brain-dump-you-have-5-cards-in-brain-dump",
    commands: ["/kanban-triage"],
    notes:
      "Walks each card; you pick Promote / Merge / Refine / Archive / Skip per card. Every decision is logged on the card.",
  },
  "backlog/reprank": {
    title: "Re-rank the Backlog",
    workflowsSection: "#6-re-rank-the-backlog-youre-about-to-start-planning-work",
    commands: ["/kanban-prioritize"],
    notes:
      "Shows a current-vs-proposed diff. You approve, override specific positions, or keep the current order.",
  },
  "backlog/refine-card": {
    title: "Flesh out a thin card",
    workflowsSection: "#7-flesh-out-a-card-before-planning-it-the-card-is-one-liner-thin",
    commands: ["/kanban-refine <card-id>"],
    notes:
      "If refining surfaces deeper unresolved questions, switch tactics — cancel, run /grill-me, then come back.",
  },

  // -- implement --------------------------------------------------------------
  "implement/from-backlog": {
    title: "Push a specific ticket all the way through",
    workflowsSection: "#8-push-a-specific-ticket-all-the-way-through-you-know-what-you-want-next",
    commands: ["/kanban list           # find the card-id", "/kanban-run <card-id>"],
    notes:
      "Walks the card from Backlog through to Done. Human gates at every column transition — approve, reject (stay), or roll back.",
  },
  "implement/cold": {
    title: "Take an idea cold from Brain Dump to Done",
    workflowsSection: "#9-chase-an-idea-cold-from-brain-dump-to-done-in-one-sitting",
    commands: [
      '/kanban-dump "<idea>"           # capture',
      "/kanban-triage                  # promote it",
      "/kanban-refine <id>             # flesh out (skip if already detailed)",
      "/kanban-run <id>                # pipeline",
    ],
  },
  "implement/mid-pipeline": {
    title: "Resume a card mid-pipeline",
    workflowsSection: "#8-push-a-specific-ticket-all-the-way-through-you-know-what-you-want-next",
    commands: ["/kanban-run <card-id>"],
    notes:
      "/kanban-run picks up from whatever column the card is in. Useful after a roll-back or if you stopped a previous session mid-flow.",
  },

  // -- setup ------------------------------------------------------------------
  "setup/first-time": {
    title: "Initial setup on this machine",
    workflowsSection: "#1-initial-setup-once-per-repo-per-machine",
    commands: [
      "cp .env.local.example .env.local",
      "# fill in TRELLO_API_KEY + TRELLO_TOKEN (board id optional)",
      "# restart Claude Code",
      "/kanban-init",
      "/kanban status",
    ],
    notes:
      "See docs/kanban/workflows.md §1 + .claude/skills/kanban/SETUP.md for the Power-Up + token walkthrough.",
  },
  "setup/sanity-check": {
    title: "Sanity-check the setup",
    workflowsSection: "#1-initial-setup-once-per-repo-per-machine",
    commands: ["/kanban status"],
    notes:
      "Verifies env, kanban.json, board reachability, and that every list + label still resolves on the live board.",
  },
  "setup/broken": {
    title: "Something is broken",
    workflowsSection: "#1-initial-setup-once-per-repo-per-machine",
    commands: ["/kanban status                          # find the red checks"],
    notes:
      "See .claude/skills/kanban/SETUP.md → Troubleshooting for fixes. Most common: a list got renamed/deleted in the Trello UI — re-run /kanban-init to reconcile.",
  },
}

function main(): void {
  const { positionals } = parseArgs({ options: {} })
  const bucket = positionals[0]
  const intent = positionals[1]
  if (!bucket || !intent) die("Usage: recipe-lookup <bucket> <intent>")

  const key = `${bucket}/${intent}`
  const recipe = RECIPES[key]
  if (!recipe) {
    const available = Object.keys(RECIPES)
      .filter((k) => k.startsWith(`${bucket}/`))
      .map((k) => `  ${k}`)
      .join("\n")
    die(
      `No recipe for "${key}".${available ? `\nAvailable for bucket "${bucket}":\n${available}` : ""}`,
    )
  }

  const lines = [`### ${recipe.title}`, "", "```", ...recipe.commands, "```"]
  if (recipe.notes) lines.push("", recipe.notes)
  lines.push(
    "",
    `Full walkthrough: [docs/kanban/workflows.md${recipe.workflowsSection}](../../docs/kanban/workflows.md${recipe.workflowsSection})`,
  )

  printText(lines.join("\n"))
}

await runScript(main)
