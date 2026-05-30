---
name: kanban
description: Trello-backed task board for the projitect workflow. Provides the primitive card operations (list, show, add, comment, move) that every other kanban-* skill builds on. Use this for one-off card edits; for full pipeline orchestration use /kanban-run, for capture use /kanban-dump, for bootstrap use /kanban-init.
---

# kanban

This is the foundation skill of the kanban bundle. Every other `kanban-*` skill links to
[shared.md](./shared.md) for the 8-column status matrix, signed-comment format, transition
rules, and board-scope guard. Read that file before doing any mutating operation — those rules
are not repeated here.

> **First-time setup**: if `.env.local` is missing the three `TRELLO_*` keys, or `.claude/kanban.json`
> is missing, stop and walk the user through [SETUP.md](./SETUP.md) — then `/kanban-init`. Do not
> attempt any other subcommand until both exist.

## When to invoke

Use `/kanban` when:

- The user asks for board state ("what's in progress", "what's in backlog", "show me card 42")
- The user wants to leave a comment on a card or rename one
- A higher-level skill (`kanban-run`, `kanban-triage`, etc.) is delegating a primitive op

Do not use `/kanban` to:

- Walk a card through multiple stages — that's `/kanban-run`
- Capture a new idea — that's `/kanban-dump`
- Set up the board for the first time — that's `/kanban-init`
- Triage Brain Dump cards — that's `/kanban-triage`

## Preflight (every subcommand)

```bash
test -f .env.local || { echo "Missing .env.local. See .claude/skills/kanban/SETUP.md"; exit 1; }
test -f .claude/kanban.json || { echo "Missing .claude/kanban.json. Run /kanban-init"; exit 1; }
: "${TRELLO_BOARD_ID:?}"
```

If any check fails, abort with the instruction in the error message — do not try to recover.

## Subcommands

### list — show board state

Read every list and print a compact one-card-per-line summary, grouped by column.

```bash
BOARD_ID=$(jq -r .boardId .claude/kanban.json)
```

Use the trello MCP `get_lists` then `get_cards_by_list_id` (one call per list — there are only 8).
For each card, print `#<short-id> <name>  <label-summary>  <last-comment-author>`.

Output should fit in a terminal screen. If a column has >5 cards, print `... +N more` after the
fifth and tell the user to drill in with `/kanban show <id>`.

### show — read a single card in full

Pull the card's description and all comments (chronological), with signed headers preserved.
This is the audit trail.

```bash
CARD_ID="$1"
# Board-scope guard — see shared.md
```

After fetching, print:

1. Card name + current column
2. Labels
3. Description (the canonical artifact — plan, impl summary, etc.)
4. Comments in order — each comment is one signed agent or human turn

### add — create a card in a specific column

```bash
LIST_NAME="$1"  # one of: brainDump, backlog, plan, planReview, impl, implReview, test, done
TITLE="$2"
BODY="${3:-}"
LIST_ID=$(jq -r ".lists.$LIST_NAME" .claude/kanban.json)
```

Use the trello MCP `add_card_to_list`. Then append a creation comment using the signed-comment
format from shared.md:

```
> **/kanban add** · human · <ISO timestamp>

Card created in "<list display name>".
```

Return the new card id. Refuse to add directly to `plan`, `planReview`, `impl`, `implReview`,
`test`, or `done` — those columns are only reachable via transitions from `backlog`. Adds go to
`brainDump` (default) or `backlog`.

### comment — append a signed comment

```bash
CARD_ID="$1"
AGENT="$2"     # e.g. "Planner", "human", "Critic"
BODY="$3"
```

Format per shared.md:

```
> **<Agent>** · <model-id-or-"human"> · <ISO timestamp>

<body>
```

The MCP tool is `add_comment`. Always verify the card belongs to the configured board first
(board-scope guard).

### move — transition a card to the next column

**This subcommand ALWAYS asks the human first via AskUserQuestion.** No exceptions. The whole
point of the kanban workflow is human-in-the-loop at every transition — see [shared.md](./shared.md)
for the rationale.

```bash
CARD_ID="$1"
TO_LIST_NAME="$2"
```

Procedure:

1. Read the card's current list. Verify the transition is allowed per the matrix in shared.md.
2. Use AskUserQuestion with three options: `Approve`, `Reject (stay)`, `Reject and roll back to <prev>`.
3. If approved: call `move_card`, then append a signed comment recording the decision:

   ```
   > **Human decision** · <ISO timestamp> · <from> → <to>

   Approved. <user's notes if any>
   ```

4. If rejected: append a comment recording the rejection. Do not move.

### status — sanity-check setup

Verify that:

- `.env.local` exists and exports the three TRELLO\_\* vars
- `.claude/kanban.json` exists and parses
- The board ID in `.claude/kanban.json` matches `$TRELLO_BOARD_ID` (env)
- Every list ID in `.claude/kanban.json` resolves on the live board (use `get_lists`)
- All 8 expected lists are present (names match exactly — case-sensitive)

Report green/red for each check. On any red, point at the fix (`/kanban-init` for missing
lists, edit `.env.local` for missing vars, etc.).

## What this skill never does

- **Never mutates a card without verifying its `idBoard`** matches the configured board. See
  the board-scope guard in shared.md. Trello tokens are account-wide; this is our last line of
  defense.
- **Never moves a card without explicit human approval** via AskUserQuestion. Even if the
  caller says "auto", refuse — the only escape hatch is editing this skill.
- **Never skips the signed comment** on a mutation. Every change to a card leaves an audit
  trail entry.
- **Never adds to a downstream column directly** (`plan` onward). New cards land in `brainDump`
  (default) or `backlog`. Everything else is a transition.

## Failure modes

- **MCP server not loaded** → "trello MCP isn't loaded for this session. Did you start the
  Claude Code session with `.env.local` available? See [SETUP.md](./SETUP.md) §Troubleshooting."
- **Board ID mismatch** between env and `.claude/kanban.json` → stop. Surface both values.
  Either the env is stale or the project config is. Ask the user which is canonical before
  touching anything.
- **Card not on configured board** → refuse the operation. This is the board-scope guard
  firing as designed.
- **List id missing in kanban.json** → run `/kanban-init` again; the board layout drifted.
- **Trello rate limit (429)** → back off 1s then retry once. If it fails twice, surface the
  rate limit and stop — don't keep retrying.
