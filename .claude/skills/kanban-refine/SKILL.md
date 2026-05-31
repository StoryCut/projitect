---
name: kanban-refine
description: Take a Brain Dump or Backlog card and flesh out its Summary, Acceptance criteria, Dependencies, and Level (L1/L2/L3). Interactive — asks targeted questions, drafts the content, asks for human approval before saving. Use before running /kanban-run on a card that's only a one-liner.
---

# kanban-refine

A planned card needs to be specific. Refinement turns "fix the foo" into a card with
acceptance criteria, dependencies, and a complexity level so the Planner subagent has
something to work with.

## When to invoke

- The user says "refine", "/kanban-refine <id>", "flesh out card <id>", "what does this
  card actually mean".
- `/kanban-triage` chained into refinement.
- `/kanban-prioritize` flagged the card as needing refinement.
- `/kanban-run` starts on a card with no acceptance criteria — pause and chain here.

Skip when:

- The card is in `plan` or later — refinement of a card mid-pipeline means rolling back,
  which is a human decision. Surface that and ask.

## Preflight

Standard kanban preflight, plus:

```bash
CARD_ID="$1"
test -n "$CARD_ID" || { echo "Usage: /kanban-refine <card-id>"; exit 1; }
# Board-scope guard per kanban/shared.md
```

## Steps

### 1. Fetch the card

Get name, description, current list, labels, and all comments. Print a compact view to the
user:

```
#<id> "<title>"  ·  in <list>  ·  labels: <list>
Summary: <first 100 chars of summary section, or "(empty)">
AC:      <count of checked / total>
Depends: <list of #ids or "none">
Level:   <L1|L2|L3|unset>
```

### 2. Identify what's missing

Compare against the [card description schema](../kanban/shared.md#card-description-schema).
Missing sections become questions for the user.

Common gaps:

- **Summary** is empty
- **Acceptance criteria** has no checkboxes
- **Depends on** isn't checked (might be unrelated; user confirms)
- **Level** is default (L2) but the card smells small (L1) or big (L3)

### 3. Ask targeted questions

Use AskUserQuestion with question groups. Don't drown the user in 8 questions at once —
ask in clusters:

**Cluster A — Scope (always)**:

- "What's the one-sentence summary?" (free-text via the 'other' option, or pick from 2-3
  auto-drafted candidates based on the title)
- "What's the smallest test that proves it's done?" (this becomes acceptance criterion #1)

**Cluster B — Dependencies (if not already set)**:

- "Does this depend on any other Backlog cards?" with options including "no" and "show me
  Backlog so I can pick"

**Cluster C — Level (if default)**:

- "How big is this?" with options:
  - L1 — Quick (skip review subagents; human reviews directly)
  - L2 — Standard (default; Critic + Inspector run)
  - L3 — Full (Critic + Inspector + extra security/perf pass)

### 4. Draft the updated description

Render the full description using the schema, with the user's answers filled in. Keep
existing sections that weren't part of the refinement (Plan, Implementation notes, etc.).

### 5. Show the diff, ask for approval

Print the proposed description (or just the changed sections — be concise).

AskUserQuestion:

- **Apply as-is**
- **Apply with edits** — user provides the specific edits, you re-render, ask again
- **Cancel** — discard, leave the card as-was

### 6. Save + comment

Use `mcp__trello__update_card_details` to write the new description. Append a signed comment:

```
> **/kanban-refine** · human · <ISO timestamp>

Refined. Added: <list of sections that gained content>. Level set to <L1|L2|L3>.
```

### 7. (If the card is in Brain Dump) offer promotion to Backlog

After a successful refinement of a Brain Dump card, ask:

- **Promote to Backlog now** — moves the card; logs another comment per `/kanban-triage`'s
  promotion pattern
- **Leave in Brain Dump** — common when the user wants to think more before committing

## What this skill never does

- **Never auto-fills the summary from the title.** The user provides actual content (or
  picks from drafted options that they confirm). Auto-fill from title produces fluff.
- **Never sets level without asking.** Level affects pipeline behavior — it's a human call.
- **Never moves a card.** Promotion (Brain Dump → Backlog) is offered post-refine but
  requires its own approval.
- **Never edits sections downstream of `## Plan`.** Refinement is upstream concern; mid-
  pipeline sections belong to the agents that produce them.

## Failure modes

- **User cancels mid-question-cluster** → save nothing, surface "no changes — card
  unchanged". The user can re-run.
- **Card's description is malformed (not following the schema)** → offer to regenerate the
  template, preserving the prose content. Ask before doing so.
- **Refinement drifts into planning** ("how would we implement this?") → stop. That's
  `/kanban-run`'s job, not refinement. Surface that and tell the user to promote + run.
