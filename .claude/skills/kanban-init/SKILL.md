---
name: kanban-init
description: One-time per-repo bootstrap for the Trello-backed kanban workflow. Reads .env.local; creates a Trello board if you haven't made one yet (interactive — asks for workspace, name, visibility); creates the 8 required lists and 3 priority labels if missing; writes .claude/kanban.json. Idempotent — re-run any time the board layout drifts. See .claude/skills/kanban/SETUP.md for the full walkthrough.
---

# kanban-init

This skill takes you from "I have Trello API credentials" to "the kanban workflow is live in
this repo". It assumes the user has already generated an API key + token and populated
`TRELLO_API_KEY` / `TRELLO_TOKEN` in `.env.local`. **The board itself is optional** — if
`TRELLO_BOARD_ID` is empty or unresolvable, this skill creates the board for them
interactively. See [SETUP.md](../kanban/SETUP.md) for the prerequisite walkthrough (creds
generation).

## When to invoke

- The user says "set up kanban for this repo", "init kanban", "/kanban-init", or similar.
- Any other `kanban-*` skill fails with "missing `.claude/kanban.json`".
- The board layout drifted — a list got renamed, a list got deleted, you added a fresh board.
- The user has Trello credentials but hasn't created a board yet — this skill will create
  one.

Skip when:

- `.env.local` is missing `TRELLO_API_KEY` or `TRELLO_TOKEN`. Send the user to
  [SETUP.md](../kanban/SETUP.md) steps 2-3 to generate them.

## Preflight

```bash
test -f .env.local || { echo "Missing .env.local. See .claude/skills/kanban/SETUP.md (steps 2-3)"; exit 1; }
set -a; source .env.local; set +a
: "${TRELLO_API_KEY:?Set TRELLO_API_KEY in .env.local — see SETUP.md step 2}"
: "${TRELLO_TOKEN:?Set TRELLO_TOKEN in .env.local — see SETUP.md step 3}"
# TRELLO_BOARD_ID may be empty on first run — Step 1 will create a board interactively.
```

If the MCP server isn't loaded for this session yet (likely on the very first run, especially
without a board), warn the user that they'll need to restart Claude Code after this init so
`.mcp.json` picks up the populated env vars. Then continue using direct REST calls (see
[shared.md](../kanban/shared.md)) for the bootstrap itself.

## Steps

### 1. Resolve or create the board

Two branches:

**A. `TRELLO_BOARD_ID` is set — try to resolve it.**

`TRELLO_BOARD_ID` may be either the 8-char short id from the URL or the 24-char full id.
Hit `GET /1/boards/$TRELLO_BOARD_ID` and inspect the HTTP status:

```bash
resp=$(curl -sSL -w "\n%{http_code}" \
  "https://api.trello.com/1/boards/$TRELLO_BOARD_ID?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN")
http_code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
```

- **200** → `BOARD_ID=$(echo "$body" | jq -r .id)`, `BOARD_URL=$(echo "$body" | jq -r .url)`,
  proceed to Step 2.
- **401** → token invalid/revoked. Surface and bail; point at SETUP.md step 3.
- **404** → board does not exist (or the id is wrong). Fall through to branch B with a
  one-line note: "Board id `$TRELLO_BOARD_ID` not found on this account — I'll create a new
  one if you want."
- Anything else → surface the status code and bail.

**B. `TRELLO_BOARD_ID` is empty (or just 404'd) — create the board.**

Interactive flow:

1. **List the user's workspaces** so they can pick one:

   ```bash
   curl -fsSL "https://api.trello.com/1/members/me/organizations?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&fields=displayName" | jq -r '.[] | "\(.id)\t\(.displayName)"'
   ```

2. **Ask which workspace** via `AskUserQuestion`. Show up to three workspaces by
   `displayName` plus "Personal board (no workspace)" as a fourth option. If the user has
   more than 3 workspaces, list the top 3 and offer "Other workspace — paste the id" via the
   `Other` escape.

3. **Ask the board name** via `AskUserQuestion`. Options: the current repo name (likely
   `projitect`) — marked recommended — plus a couple of alternatives, and an `Other` for
   free text.

4. **Ask visibility** via `AskUserQuestion`. Three options:
   - **Private (Recommended)** — only invited members; safest, given Trello tokens are
     account-wide
   - **Workspace** — anyone in the workspace can see it
   - **Public** — anyone on the internet can see it (rare for a project board)

5. **Create the board** with `defaultLists=false` so Trello doesn't pre-populate the three
   default lists you'd then have to delete:

   ```bash
   POST_BODY="name=$BOARD_NAME&defaultLists=false&prefs_permissionLevel=$VISIBILITY"
   [ -n "$WORKSPACE_ID" ] && POST_BODY="$POST_BODY&idOrganization=$WORKSPACE_ID"
   created=$(curl -fsSL -X POST \
     "https://api.trello.com/1/boards/?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
     --data "$POST_BODY")
   BOARD_ID=$(echo "$created" | jq -r .id)
   BOARD_URL=$(echo "$created" | jq -r .url)
   ```

   (`prefs_permissionLevel` accepts `private`, `org`, or `public`. Map the AskUserQuestion
   answer accordingly.)

6. **Tell the user the new id, and ask them to paste it into `.env.local`** — the skill
   never modifies `.env.local` directly. Format:

   > Created board `<BOARD_NAME>` at `<BOARD_URL>` (id `<BOARD_ID>`). Add this line to your
   > `.env.local` so the MCP server uses it on next launch:
   >
   > ```
   > TRELLO_BOARD_ID=<BOARD_ID>
   > ```
   >
   > Restart Claude Code after saving so `.mcp.json` picks up the new env. The rest of this
   > init run uses the new id directly — no need to restart mid-flow.

   Then proceed to Step 2 with `BOARD_ID` set in the current shell.

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
- **404 on the board** → `TRELLO_BOARD_ID` points at a board that doesn't exist (or that the
  current token can't see). Step 1 branch B catches this and offers to create a fresh board.
- **User has no Trello workspaces** → `GET /1/members/me/organizations` returns `[]`. Skip
  the workspace question and create a personal board (`idOrganization` omitted from the POST
  body). Personal boards are private to the token-owning user by default.
- **Board creation fails (Trello plan limits, name collision, etc.)** → surface Trello's
  error response verbatim and bail. Common cases: free-plan workspace board limit reached,
  duplicate board name in the same workspace.
- **A list with the right name exists at the wrong position** → record its id anyway; don't
  reorder (Trello drag-rearranging is the user's prerogative).
- **More than one list with the same name** → Trello allows duplicates. Pick the lowest-pos
  one, warn the user that they have a dup to clean up.
