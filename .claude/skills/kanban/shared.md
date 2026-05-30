# kanban — shared context

Every `kanban-*` skill links here. Single source of truth for board layout, transition rules,
comment format, and safety invariants. Adapted from `cyanluna-git/cyanluna.skills`'s
[`kanban/shared.md`](https://github.com/cyanluna-git/cyanluna.skills/blob/main/kanban/shared.md),
modified for Trello and projitect's human-in-loop posture.

## Board layout — 8 columns

| Position | List name (display) | `kanban.json` key | Purpose                                                           |
| -------- | ------------------- | ----------------- | ----------------------------------------------------------------- |
| 1        | Brain Dump          | `brainDump`       | Capture-only. Unrefined ideas from humans or agents.              |
| 2        | Backlog             | `backlog`         | Refined + prioritized. Ready to be planned.                       |
| 3        | Plan                | `plan`            | A planner subagent is drafting the implementation plan.           |
| 4        | Plan Review         | `planReview`      | A critic subagent has scored the plan; human approves or rejects. |
| 5        | Impl                | `impl`            | A builder subagent is writing code per the approved plan.         |
| 6        | Impl Review         | `implReview`      | An inspector subagent has scored the diff; human approves.        |
| 7        | Test                | `test`            | A tester subagent has run `pnpm check-all`; human approves done.  |
| 8        | Done                | `done`            | Terminal. Card is archived after ~7 days via Trello automation.   |

The display names go on the Trello board _exactly_ as written above (with the space). The
`kanban.json` keys are the ones every skill references.

## Per-project config — `.claude/kanban.json`

Committed file. Written by `/kanban-init`. Schema:

```json
{
  "boardId": "5f8b3c1d4e2f6a0001234567",
  "boardUrl": "https://trello.com/b/abc12345/projitect",
  "lists": {
    "brainDump": "5f8b3c1d4e2f6a0001234568",
    "backlog": "5f8b3c1d4e2f6a0001234569",
    "plan": "5f8b3c1d4e2f6a000123456a",
    "planReview": "5f8b3c1d4e2f6a000123456b",
    "impl": "5f8b3c1d4e2f6a000123456c",
    "implReview": "5f8b3c1d4e2f6a000123456d",
    "test": "5f8b3c1d4e2f6a000123456e",
    "done": "5f8b3c1d4e2f6a000123456f"
  },
  "labels": {
    "priority-high": "...",
    "priority-medium": "...",
    "priority-low": "..."
  }
}
```

Per-user overrides live in `.claude/kanban.local.json` (gitignored) — same schema, deep-merged
on top. Use it when you fork the project board for a personal copy and want different IDs
without touching the committed file.

## Status transition matrix

A card may only move along the arrows below. Any other move is rejected by `/kanban move`.

```
brainDump → backlog        (via /kanban-triage)
brainDump → (archived)     (via /kanban-triage)

backlog ↔ backlog          (re-rank via /kanban-prioritize)
backlog → plan             (via /kanban-run, requires refined card)
backlog → (archived)       (via /kanban-triage roll-back)

plan → planReview          (planner agent finishes)
plan → backlog             (human reject, roll back)

planReview → impl          (human approves the critic's verdict)
planReview → plan          (critic requests changes, retry)
planReview → backlog       (human rolls back)

impl → implReview          (builder agent finishes)
impl → plan                (builder hits a problem; re-plan)
impl → backlog             (human rolls back)

implReview → test          (human approves the inspector's verdict)
implReview → impl          (inspector requests changes, retry)

test → done                (human approves; tester is green)
test → impl                (tester is red; re-implement)
```

Every transition fires `AskUserQuestion` first. Even the forward-progress ones. The user can:

- **Approve** — move forward
- **Reject (stay)** — keep card in current column, comment trail records the reason
- **Roll back** — move to a prior column with a comment explaining what's wrong

The roll-back columns above (`→ plan`, `→ backlog`) document the _available_ targets a human
can pick. A retry counter is tracked in the card description (see _Card description schema_
below); after the third forward-attempt from `planReview` or `implReview` the orchestrator
hard-stops and asks the user to intervene, mirroring cyanluna's circuit breaker.

## Signed-comment format

Every change to a card leaves a comment. No silent edits. Format:

```
> **<Actor>** · <model-or-"human"> · <ISO 8601 UTC timestamp>

<body — markdown ok>
```

Examples:

```
> **Planner** · claude-opus-4-7 · 2026-05-30T14:22:00Z

Plan complete. 3 files to modify: ...
```

```
> **Human decision** · 2026-05-30T14:25:11Z · planReview → impl

Approved. The error-id approach is the right call.
```

```
> **/kanban-triage** · human · 2026-05-30T09:01:42Z · merged into #87

Duplicate of #87 (same root concern: stale tsconfig refs). Archiving.
```

The `<Actor>` is the skill or agent name (`Planner`, `Critic`, `Builder`, `Inspector`,
`Tester`, `/kanban-triage`, `/kanban-prioritize`, `Human decision`). The model id should be
the literal Anthropic model id (e.g. `claude-opus-4-7`) for agent comments, or `human` for
human-driven actions invoked through a skill.

## Card description schema

The card body (Trello description, markdown) holds the canonical artifact. It's NOT a free-form
field — it follows this template, sections appended as the card progresses:

```
## Summary
<one-paragraph what this card is about>

## Acceptance criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Depends on
- #<card-short-id>  (or "none")

## Plan
<rendered by Planner during plan phase; null until then>

## Implementation notes
<rendered by Builder during impl phase>

## Test results
<rendered by Tester during test phase>

## Meta
- level: L1 | L2 | L3
- plan_review_attempts: 0
- impl_review_attempts: 0
```

The `Meta` block's `level` is a complexity hint (cyanluna's L1/L2/L3 concept):

- **L1 — Quick**: small, well-scoped, no review subagent needed (orchestrator can still ask the
  human between transitions; the critic/inspector subagents are skipped, comments are noted
  by the human directly).
- **L2 — Standard**: review subagents run; default.
- **L3 — Full**: review subagents run + extra inspection pass for security/perf.

Default is L2. `/kanban-refine` is where the level is set.

## Board-scope guard

**Run before every mutating MCP call.** Trello tokens are account-wide; this is the only thing
preventing a misconfigured skill from clobbering a card on someone else's board.

```bash
guard_card_on_board() {
  local card_id="$1"
  local configured_board_id
  configured_board_id=$(jq -r .boardId .claude/kanban.json)
  # Pseudocode for the MCP call — actual tool name from the loaded trello MCP:
  local card_board_id
  card_board_id=$(mcp_get_card_details "$card_id" | jq -r .idBoard)
  if [ "$card_board_id" != "$configured_board_id" ]; then
    echo "BOARD-SCOPE VIOLATION: card $card_id is on board $card_board_id, but kanban.json" >&2
    echo "says we're operating on $configured_board_id. Refusing the operation." >&2
    return 1
  fi
}
```

Skills should call this immediately after parsing the card id from input, before any mutation.

## Trello MCP tool names

The loaded MCP server is `@delorenj/mcp-server-trello`. Tools surface under the `mcp__trello__`
prefix at runtime. The names referenced in this bundle:

| Operation                 | Tool name (best-guess; verify against the loaded MCP) |
| ------------------------- | ----------------------------------------------------- |
| List all lists on board   | `mcp__trello__get_lists`                              |
| List cards in one list    | `mcp__trello__get_cards_by_list_id`                   |
| Get card details          | `mcp__trello__get_card`                               |
| Get comments on a card    | `mcp__trello__get_card_comments`                      |
| Create card in a list     | `mcp__trello__add_card_to_list`                       |
| Move card to another list | `mcp__trello__move_card`                              |
| Update card name / desc   | `mcp__trello__update_card_details`                    |
| Add a comment             | `mcp__trello__add_comment`                            |
| Archive a card            | `mcp__trello__archive_card`                           |
| Add a label to a card     | `mcp__trello__add_label_to_card`                      |
| Re-rank (set pos)         | `mcp__trello__update_card_details` (`pos` field)      |

If a tool name in this table doesn't match what the MCP actually exposes when you load it,
**fix this table** — it's the canonical reference for the rest of the bundle.

## Falling back to direct REST

If the MCP is unavailable (server down, network restrictions, registry unreachable), every
operation has an equivalent `curl` call against `https://api.trello.com/1/`. Pass
`key=$TRELLO_API_KEY` and `token=$TRELLO_TOKEN` as query params. The Trello REST API is
stable and well-documented at
[developer.atlassian.com/cloud/trello](https://developer.atlassian.com/cloud/trello/rest/).

Example — add a comment via REST:

```bash
curl -fsSL -X POST \
  "https://api.trello.com/1/cards/$CARD_ID/actions/comments?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  --data-urlencode "text=$COMMENT_BODY"
```

Use this only when the MCP is unreachable. Skills should prefer the MCP path.
