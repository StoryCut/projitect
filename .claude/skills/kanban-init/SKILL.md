---
name: kanban-init
description: One-time per-repo bootstrap for the Trello-backed kanban workflow. Reads .env.local, resolves the board id, creates the 8 required lists if missing, writes .claude/kanban.json, and optionally creates the three priority labels. Idempotent — re-run any time the board layout drifts. See .claude/skills/kanban/SETUP.md for the full setup walkthrough this skill is the tail end of.
---

# kanban-init

This skill is the tail end of [SETUP.md](../kanban/SETUP.md) — it assumes the user has
already created their Trello board, generated an API key + token, and populated `.env.local`.
If those aren't done yet, point the user at SETUP.md and stop.

## When to invoke

- The user says "set up kanban for this repo", "init kanban", "/kanban-init", or similar.
- Any other `kanban-*` skill fails with "missing `.claude/kanban.json`".
- The board layout drifted — a list got renamed, a list got deleted, you added a fresh board.

Skip when:

- `.env.local` is missing any of `TRELLO_API_KEY` / `TRELLO_TOKEN` / `TRELLO_BOARD_ID`. Send
  the user to [SETUP.md](../kanban/SETUP.md) instead.

## Preflight

```bash
test -f .env.local || { echo "Missing .env.local. See .claude/skills/kanban/SETUP.md (steps 2-4)"; exit 1; }
set -a; source .env.local; set +a
: "${TRELLO_API_KEY:?Set TRELLO_API_KEY in .env.local — see SETUP.md step 2}"
: "${TRELLO_TOKEN:?Set TRELLO_TOKEN in .env.local — see SETUP.md step 3}"
: "${TRELLO_BOARD_ID:?Set TRELLO_BOARD_ID in .env.local — see SETUP.md step 4}"
```

If the MCP server isn't loaded for this session yet (likely on the very first run), warn the
user that they'll need to restart Claude Code after this init so `.mcp.json` picks up the
new env vars. Then continue using direct REST calls (see [shared.md](../kanban/shared.md))
for the bootstrap itself.

## Steps

### 1. Resolve the board id

`TRELLO_BOARD_ID` may be either the 8-char short id from the URL or the 24-char full id.
Resolve to the full id:

```bash
BOARD_ID=$(curl -fsSL \
  "https://api.trello.com/1/boards/$TRELLO_BOARD_ID?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  | jq -r .id)
BOARD_URL=$(curl -fsSL \
  "https://api.trello.com/1/boards/$BOARD_ID?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&fields=url" \
  | jq -r .url)
```

If either curl returns 404 or 401, surface a specific error: 404 → bad board id; 401 → bad
token. Point at the relevant SETUP.md step.

### 2. List existing lists

```bash
EXISTING=$(curl -fsSL \
  "https://api.trello.com/1/boards/$BOARD_ID/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN")
```

`EXISTING` is a JSON array of `{id, name, pos}`.

### 3. Reconcile the 8 required lists

Required, in this exact order, with these exact display names:

| Position | Display name | kanban.json key |
| -------- | ------------ | --------------- |
| 1        | Brain Dump   | brainDump       |
| 2        | Backlog      | backlog         |
| 3        | Plan         | plan            |
| 4        | Plan Review  | planReview      |
| 5        | Impl         | impl            |
| 6        | Impl Review  | implReview      |
| 7        | Test         | test            |
| 8        | Done         | done            |

For each required list:

- If a list with that exact name exists → record its id.
- If missing → create it via `POST /1/boards/$BOARD_ID/lists` with `name` and `pos` (use the
  position number multiplied by a step so Trello's internal positions interleave cleanly:
  `pos=$((position * 65536))` works). Record the new id.

```bash
# Pseudocode — actual implementation calls curl per missing list:
for name in "Brain Dump" "Backlog" "Plan" "Plan Review" "Impl" "Impl Review" "Test" "Done"; do
  id=$(echo "$EXISTING" | jq -r --arg n "$name" '.[] | select(.name == $n) | .id')
  if [ -z "$id" ]; then
    id=$(curl -fsSL -X POST \
      "https://api.trello.com/1/boards/$BOARD_ID/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
      --data-urlencode "name=$name" \
      --data-urlencode "pos=bottom" | jq -r .id)
    echo "Created list: $name ($id)"
  fi
  # Accumulate into a JSON object
done
```

Report any extras (lists on the board not in our 8) — they stay (don't auto-delete a list
the user created), but warn the user that `/kanban move` will refuse to target them.

### 4. Reconcile labels

The three priority labels are required. Same pattern:

```bash
EXISTING_LABELS=$(curl -fsSL \
  "https://api.trello.com/1/boards/$BOARD_ID/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN")

for label in "priority-high:red" "priority-medium:yellow" "priority-low:sky"; do
  name="${label%:*}"
  color="${label#*:}"
  id=$(echo "$EXISTING_LABELS" | jq -r --arg n "$name" '.[] | select(.name == $n) | .id')
  if [ -z "$id" ]; then
    id=$(curl -fsSL -X POST \
      "https://api.trello.com/1/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
      --data-urlencode "idBoard=$BOARD_ID" \
      --data-urlencode "name=$name" \
      --data-urlencode "color=$color" | jq -r .id)
  fi
done
```

### 5. Write `.claude/kanban.json`

```json
{
  "boardId": "<resolved id>",
  "boardUrl": "<board url>",
  "lists": {
    "brainDump": "...",
    "backlog": "...",
    "plan": "...",
    "planReview": "...",
    "impl": "...",
    "implReview": "...",
    "test": "...",
    "done": "..."
  },
  "labels": {
    "priority-high": "...",
    "priority-medium": "...",
    "priority-low": "..."
  }
}
```

Pretty-print (2-space indent). If the file already exists, show the diff and ask the user
to confirm before overwriting.

### 6. Update `.env.local` if board id changed

If you resolved the short id to a longer one (or vice versa), tell the user:

> Your `TRELLO_BOARD_ID` resolved from `<input>` to `<resolved>`. Update `.env.local` so the
> MCP server uses the canonical id.

Don't edit `.env.local` automatically — it's the user's secrets file.

### 7. Verify

Run `/kanban status` as the closing check. If it's all-green, success — tell the user the
next step is `/kanban-dump "first idea"` (or restart Claude Code if the MCP wasn't loaded
this session yet).

## What this skill never does

- **Never deletes a list** even if it's not one of the 8 required. The user might have
  custom lists for personal use; we don't touch them.
- **Never deletes cards.** Init is purely additive.
- **Never modifies `.env.local`.** That's the user's secrets file — surface a message asking
  them to update it instead.
- **Never commits `.claude/kanban.json` automatically.** Surface the file diff and let the
  user decide when to commit (it's committed because teammates need the same list mapping —
  see [shared.md](../kanban/shared.md)).

## Failure modes

- **401 unauthorized** on any call → token is wrong, expired, or revoked. Send the user back
  to SETUP.md step 3.
- **404 on the board** → `TRELLO_BOARD_ID` is wrong. SETUP.md step 4.
- **A list with the right name exists at the wrong position** → record its id anyway; don't
  reorder (Trello drag-rearranging is the user's prerogative).
- **More than 8 lists with the same name** → Trello allows duplicates. Pick the lowest-pos
  one, warn the user that they have a dup to clean up.
