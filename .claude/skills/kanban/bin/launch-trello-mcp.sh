#!/usr/bin/env bash
# Launches the Trello MCP server with credentials loaded from .env.local.
# Invoked by .mcp.json on Claude Code session start.
# See .claude/skills/kanban/SETUP.md for setup walkthrough.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
env_file="$repo_root/.env.local"

if [ -f "$env_file" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
fi

missing=()
[ -z "${TRELLO_API_KEY:-}" ] && missing+=("TRELLO_API_KEY")
[ -z "${TRELLO_TOKEN:-}" ] && missing+=("TRELLO_TOKEN")
[ -z "${TRELLO_BOARD_ID:-}" ] && missing+=("TRELLO_BOARD_ID")

if [ ${#missing[@]} -gt 0 ]; then
  echo "trello-mcp: missing required env vars: ${missing[*]}" >&2
  echo "trello-mcp: copy .env.local.example to .env.local and fill in the values." >&2
  echo "trello-mcp: see .claude/skills/kanban/SETUP.md for the walkthrough." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "trello-mcp: pnpm not found. Run 'nvm use' from the repo root (reads .nvmrc) and retry." >&2
  exit 1
fi

# @delorenj/mcp-server-trello is a Bun-built package but ships a Node-compatible ESM
# bundle. Pinned for reproducibility — bump deliberately after testing.
exec pnpm dlx @delorenj/mcp-server-trello@1.7.1
