# kanban — first-time setup

This walkthrough is what `/kanban-init` (and the `kanban` skill's "missing config" error)
points you at. Follow it once per repo, per machine. End state: you can run `/kanban` and see
your projitect board.

## What you'll end up with

- A Trello board with 8 lists matching the [status matrix](./shared.md#board-layout--8-columns).
- A repo-local `.env.local` (gitignored) holding your Trello API key, token, and board ID.
- A committed `.claude/kanban.json` mapping list names → Trello list IDs.
- The `@delorenj/mcp-server-trello` MCP server running under your Claude Code session
  (launched via `pnpm dlx` — no new runtime to install), scoped to your board via env.

Total time: ~10 minutes the first time.

## Step 1 — Create the Trello board

Skip if you already have a board you want to use.

1. Go to [trello.com](https://trello.com), pick a workspace (or create one for projitect).
2. Create a new board, name it `projitect` (or whatever).
3. **Delete** the three default lists (`To Do`, `Doing`, `Done`).
4. Either: create the 8 lists by hand in this order (left-to-right), names exactly as written:
   `Brain Dump`, `Backlog`, `Plan`, `Plan Review`, `Impl`, `Impl Review`, `Test`, `Done`.
   Or: skip — `/kanban-init` will create any missing lists for you in step 6.

Copy the board URL from your browser; it looks like
`https://trello.com/b/abc12345/projitect`. You'll need the `abc12345` segment in step 5.

### Recommended: dedicated service account

Trello tokens are **account-wide** — they grant the bearer access to every board you can see.
The MCP server enforces a single-board scope, and our skills double-check via the
[board-scope guard](./shared.md#board-scope-guard), but defense in depth means: create a
**second Trello user** (e.g. `kapil+projitect@…`), invite it to the projitect board only,
and generate the API key + token from that account. A stolen token then only exposes the
projitect board, not your personal Trello.

If you skip this, your token is account-wide. That's a _you_ decision — note it and move on.

## Step 2 — Generate an API key

Trello deprecated `trello.com/app-key`. Every integration is now its own Power-Up that owns
its API key.

1. Visit [trello.com/power-ups/admin](https://trello.com/power-ups/admin).
2. Click **New** to create a Power-Up:
   - Name: `projitect-kanban`
   - Workspace: the workspace that owns your projitect board
   - Iframe connector URL: leave blank
   - Categories: leave blank
3. Open the Power-Up. Click the **API Key** tab.
4. Click **Generate a new API Key**.
5. Copy the key. This is `TRELLO_API_KEY`.

## Step 3 — Generate a token

Open this URL in a browser (substitute your `TRELLO_API_KEY` from step 3):

```
https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=projitect-kanban&key=YOUR_TRELLO_API_KEY
```

Click **Allow**. Trello displays a 76-character token. Copy it. This is `TRELLO_TOKEN`.

The token does not expire (`expiration=never`). You can revoke it any time at
`https://trello.com/u/<your-username>/account` → **Power-Ups and Integrations** → find
`projitect-kanban` → **Revoke**.

## Step 4 — Populate `.env.local`

From the repo root:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in:

```
TRELLO_API_KEY=<from step 2>
TRELLO_TOKEN=<from step 3>
TRELLO_BOARD_ID=<from the board URL, the segment after /b/>
```

The short board ID from the URL is fine — `/kanban-init` will resolve it to the full 24-char
id and write that into `.claude/kanban.json`.

`chmod 600 .env.local` is good hygiene if you share the machine.

## Step 5 — Run `/kanban-init`

```bash
# Inside Claude Code:
/kanban-init
```

What it does:

1. Reads `.env.local`. Aborts if any of the three vars are empty.
2. Resolves the board id (handles both short URL segments and full ids).
3. Lists the existing lists on the board.
4. For each of the 8 required lists: if present, records its id; if missing, creates it at
   the right position.
5. Writes `.claude/kanban.json` with the board id, board URL, and the 8 list ids.
6. Optionally creates the three priority labels (`priority-high`, `-medium`, `-low`).
7. Asks for your approval to commit `.claude/kanban.json` (it's checked in — that's how
   teammates pick up the same board mapping).

`/kanban-init` is **idempotent**. Re-run it any time the board layout changes (you renamed a
list, added a label, etc.) and it will reconcile.

## Step 6 — Verify

```bash
/kanban status
```

Expect all-green: env vars present, kanban.json parses, board id matches, every list resolves.

```bash
/kanban list
```

Should print the (probably empty) board. Then:

```bash
/kanban-dump "Try out the kanban setup"
```

This creates a card in Brain Dump. Open the board in your browser, see the card with its
signed creation comment.

## Step 7 — Sourcing `.env.local` for future sessions

`scripts/launch-trello-mcp.sh` (the launcher referenced by `.mcp.json`) sources `.env.local`
itself before exec'ing the MCP server. **You do not need to source it in your shell.** Just
launch Claude Code from the repo root and the MCP picks up the creds.

If you launch from outside the repo, the relative path in `.mcp.json` will fail — always
launch from the repo root.

## Troubleshooting

### "trello MCP isn't loaded for this session"

The launcher likely failed. Run it manually to see the error:

```bash
./scripts/launch-trello-mcp.sh
```

Most common failures: env var missing (the launcher prints which one), `pnpm` not on PATH
(run `nvm use` from the repo root), or `@delorenj/mcp-server-trello` failed to fetch
(network issue — retry; pnpm caches the package after the first fetch).

### "401 unauthorized" on first call

Token is bad, expired (if you set `expiration=1day` accidentally), or revoked. Regenerate
per Step 3 and overwrite `.env.local`.

### "404 not found" on the board

`TRELLO_BOARD_ID` is wrong. Open the board in your browser, copy the segment after `/b/`,
overwrite, then re-run `/kanban-init`.

### Cards appear on the wrong board

The [board-scope guard](./shared.md#board-scope-guard) should prevent this. If it fired, you'll
see a `BOARD-SCOPE VIOLATION` message in the skill output. Fix: make sure `TRELLO_BOARD_ID`
(env) and `.claude/kanban.json` `boardId` agree.

### Rate-limited (429)

Trello's free tier limits are generous (~300 requests / 10s per API key). If you hit it, the
`kanban` skill backs off once and retries. Persistent 429s mean you're running multiple
orchestrators in parallel — don't.

## Alternative: REST-only

If the MCP server can't be reached (network restrictions, registry mirror missing the
package, etc.), every skill in this bundle has a REST-fallback pattern documented in
[shared.md → Falling back to direct REST](./shared.md#falling-back-to-direct-rest). Drop the
MCP entirely: delete `.mcp.json`, and the skills route through `curl`. Slower and uglier in
the transcript but functionally identical.

## Tearing it down

```bash
# 1. Revoke the token at https://trello.com/u/<username>/account
# 2. Delete the local config:
rm .env.local
rm .claude/kanban.json
# 3. (Optional) Archive the Trello board.
```
