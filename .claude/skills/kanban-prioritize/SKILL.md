---
name: kanban-prioritize
description: Re-rank cards within the Backlog and surface candidates that need more refinement before planning. Every reorder is human-approved. Use when starting a planning session or when the Backlog has grown enough that ordering matters more than throughput.
---

# kanban-prioritize

Backlog is ordered. Trello uses `pos` (a float; smaller = higher) to define order. This skill
walks the Backlog and proposes a new order based on label, dependencies, and freshness —
then the human approves (or overrides) before any card is moved.

## When to invoke

- The user says "prioritize", "/kanban-prioritize", "re-rank the backlog", "what should I
  work on next".
- After a `/kanban-triage` session that added several cards.
- Before a planning session.

Skip when:

- Backlog is empty or has 1 card. Nothing to rank.
- The user wants to plan a _specific_ card next — use `/kanban-run` directly with that card.

## Preflight

Standard kanban preflight.

## Steps

### 1. Fetch the Backlog

```bash
BACKLOG_ID=$(jq -r .lists.backlog .claude/kanban.json)
```

Pull every card with: id, name, labels, current `pos`, and the first 200 chars of the
description (enough to see acceptance criteria density).

### 2. Score each card

Apply this scoring sketch (the user can override anything):

- **+30** if labeled `priority-high`
- **+10** if labeled `priority-medium`
- **+0** if labeled `priority-low` or unlabeled
- **+15** if every other card in Backlog has higher priority depends_on this one (it's a
  bottleneck)
- **−10** if the description has no `## Acceptance criteria` filled in (needs refinement
  before it's planning-ready)
- **−5** if the card has been in Backlog >14 days without a comment (stale — surface it for
  reconsideration)

The score is informational. The user decides.

### 3. Sort + diff

Sort by score (descending), then by current `pos` (descending — to break ties in favor of
the current order; minimizes churn).

Present the user with a side-by-side: current order vs proposed order. Use card titles +
score + the +/− factors that contributed.

Example output format:

```
Current  Proposed  Card                            Score  Why
─────    ────      ──────────────────────────       ─────  ─────────────────────────────
  1       1        Fix stale tsconfig refs          +30    priority-high
  2       3        Refactor blueprint loader        +10    priority-medium, no AC (−10)
  3       2        Add --json to pjt inspect        +30    priority-high
  4       6        Document new error ids           −5     priority-medium, stale (−5)
  ...
```

### 4. Ask the human to confirm or override

Single AskUserQuestion with options:

- **Apply proposed order**
- **Apply, but I want to override specific cards first** — chain into a per-card override
  loop (user provides card id + new rank; repeat until they say done)
- **Keep current order** — no-op
- **Show me the cards needing refinement first** — list the `−10` cards and surface a
  one-liner suggestion to run `/kanban-refine` on each

### 5. Apply the new order

For each card whose position changed, update its `pos`:

```bash
mcp__trello__update_card_details --card-id $ID --pos $NEW_POS
```

(`pos` uses Trello's float convention — assign `1`, `2`, `3`, … then call Trello with
`pos=bottom` style or compute floats like `(prev + next) / 2`. The MCP server handles the
conversion if you pass integers.)

### 6. Log the prioritization

Append one summary comment to each card whose rank changed:

```
> **/kanban-prioritize** · human · <ISO timestamp>

Re-ranked: <old rank> → <new rank>. <Brief: which factor pushed it.>
```

For cards that didn't move, no comment.

### 7. Flag refinement candidates

If any `−10` (no AC) cards exist, end with a suggestion:

> These cards need refinement before planning: #<id> "<title>", #<id> "<title>". Run
> `/kanban-refine <id>` to flesh them out.

## What this skill never does

- **Never moves a card across columns.** Reorder within Backlog only.
- **Never changes a label.** Re-ranking respects existing labels; label changes are
  `/kanban-refine`'s territory.
- **Never overrides without showing the proposal first.** The user always sees the diff
  before any reorder.
- **Never deletes the scoring sketch's manual override.** The +30 / +10 / etc. weights are
  a starting point — if the user wants different weights, they can edit this skill.

## Failure modes

- **Backlog has >50 cards** → propose to chunk: top 20 only, rest stays. Triage the long
  tail separately.
- **Trello `pos` collision** (two cards end up at the same float) → Trello handles this fine
  (it uses string comparison as a tiebreaker), no action needed.
- **User changes their mind mid-loop** → the override loop has an "apply nothing, start over"
  exit.
