# Portability — extracting this bundle as a Claude Code plugin

This bundle lives as project-local skills inside the `projitect` repo while it bakes. The
goal is to package it as a Claude Code plugin so it drops cleanly into other repos.

References:
[Anthropic Skills docs](https://code.claude.com/docs/en/skills) ·
[Plugins docs](https://code.claude.com/docs/en/plugins) ·
[Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

## Current state (project-local)

```
projitect/
├── .claude/
│   ├── skills/
│   │   ├── kanban/           ← foundation + supporting docs (SETUP.md, shared.md, templates/)
│   │   ├── kanban-init/
│   │   ├── kanban-dump/
│   │   ├── kanban-triage/
│   │   ├── kanban-prioritize/
│   │   ├── kanban-refine/
│   │   ├── kanban-run/
│   │   ├── kanban-help/
│   │   └── grill-me/
│   └── settings.json         ← pre-allowed Bash + mcp__trello__* perms
├── scripts/
│   ├── kanban/               ← 14 TS helpers + lib/ + tsconfig.json
│   └── launch-trello-mcp.sh
├── docs/kanban/workflows.md  ← human-facing playbook
├── .mcp.json                 ← Trello MCP registration
├── .env.local.example        ← credential template
└── AGENTS.md § Kanban workflow ← project-level rules
```

This is correct project-local layout per the Anthropic Skills spec.

## Target state (Claude Code plugin)

When ready to extract, lay out the plugin like this:

```
projitect-kanban-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/                       ← NB: drops the `.claude/` prefix
│   ├── kanban/
│   │   ├── SKILL.md
│   │   ├── shared.md
│   │   ├── SETUP.md
│   │   └── templates/{planner,critic,builder,inspector,tester}.md
│   ├── kanban-init/SKILL.md
│   ├── kanban-dump/SKILL.md
│   ├── kanban-triage/SKILL.md
│   ├── kanban-prioritize/SKILL.md
│   ├── kanban-refine/SKILL.md
│   ├── kanban-run/SKILL.md
│   ├── kanban-help/SKILL.md
│   └── grill-me/SKILL.md
├── scripts/kanban/               ← TS helpers travel with the plugin
├── docs/kanban/workflows.md
├── bin/launch-trello-mcp.sh      ← MCP launcher (renamed from scripts/)
├── .mcp.json                     ← uses ${CLAUDE_PLUGIN_ROOT} placeholder
├── settings.json                 ← plugin-level pre-allowed perms
├── .env.local.example
└── README.md                     ← prereqs + install + first-run
```

Anthropic's recommendation is to keep scripts inside the skill directory (e.g.
`skills/kanban/scripts/`). The plugin layout above keeps them sibling-level for the same
reason we do today — they're shared across all the kanban-\* skills, not owned by any one
of them. Either is acceptable; pick what reads best at extraction time.

## `.claude-plugin/plugin.json` template

```json
{
  "name": "projitect-kanban",
  "version": "0.1.0",
  "description": "Trello-backed kanban workflow for Claude Code — Brain Dump → Backlog → Plan → Plan Review → Impl → Impl Review → Test → Done, with a human approval gate at every transition.",
  "author": { "name": "..." },
  "homepage": "https://github.com/<owner>/projitect-kanban",
  "repository": "https://github.com/<owner>/projitect-kanban",
  "license": "MIT"
}
```

The only required fields are `name` and `description`. `version` defaults to the git
commit SHA if omitted, but pinning explicitly is friendlier for marketplace consumers.

## What changes during extraction

1. **Drop `.claude/` prefix on skill directories** — `.claude/skills/<name>/` → `skills/<name>/`
2. **MCP launcher path** — `.mcp.json`'s `./scripts/launch-trello-mcp.sh` becomes
   `${CLAUDE_PLUGIN_ROOT}/bin/launch-trello-mcp.sh` so it resolves from the installed
   plugin location, not the consuming repo's cwd
3. **Settings → plugin `settings.json`** — move the Trello-related entries
   (`Bash(jq:*)`, `Bash(curl https://api.trello.com:*)`, `mcp__trello__*`,
   `enabledMcpjsonServers: ["trello"]`) out of the consuming repo's `.claude/settings.json`
   and into the plugin's `settings.json` so they're available wherever the plugin is
   installed
4. **AGENTS.md references** — the skill bodies link to `AGENTS.md → Kanban workflow` in a
   few spots. Inline that content into `kanban/shared.md` (or a new plugin README) since
   the consuming repo won't have a matching AGENTS.md section
5. **Project-rule citations in templates** — `templates/builder.md` cites projitect's Effect
   v4 / "no `as`" / pnpm-only rules. These are projitect-specific; for the plugin, swap
   them with a generic "follow the consuming repo's AGENTS.md / CLAUDE.md conventions"
   directive
6. **Scripts path in skill bodies** — references like `pnpm exec tsx scripts/kanban/<x>.ts`
   become `${CLAUDE_PLUGIN_ROOT}/scripts/kanban/<x>.ts` (or wrap each script invocation in
   a thin plugin-installed bin shim)
7. **tsx availability** — the plugin needs `tsx` available where it's installed. Either
   document it as a prereq in the README or ship a small bootstrap script that installs
   `tsx` globally on first use

## What does NOT ship in the plugin

- `.claude/kanban.json` — board-specific to whichever repo installed the plugin.
  Generated by `/kanban-init` per-repo. Stays at consumer-repo `.claude/kanban.json`.
- `.env.local` — per-user credentials. The plugin ships `.env.local.example`; consumers
  copy + fill in.
- `package.json` `kanban:status` / `kanban:score` scripts — those are projitect-specific
  npm scripts. Consumers can add similar shortcuts to their own `package.json` if they
  want them; the underlying script invocation works without them.

## Distribution

Three paths (in order of how locked-down they are):

1. **File system / git path for testing** — `/plugin install <local-path-or-git-url>`
2. **Private marketplace** — host a git repo containing
   `.claude-plugin/marketplace.json` that catalogs your team's plugins. Teammates run
   `/plugin marketplace add <repo>` then `/plugin install projitect-kanban@<marketplace>`
3. **Community marketplace** — submit to `claude-plugins-community` if appropriate

Versioning: explicit semver in `plugin.json` is friendlier than relying on git-SHA pinning.

## Pre-extraction checklist

When you're ready (post bake-in), the steps in order:

- [ ] Create new repo `projitect-kanban` (or similar). Initialize `.claude-plugin/plugin.json`.
- [ ] Copy each `.claude/skills/<name>/` → new repo's `skills/<name>/`
- [ ] Copy `scripts/kanban/`, `scripts/launch-trello-mcp.sh` (→ `bin/`), `docs/kanban/`,
      `.mcp.json`, `.env.local.example`
- [ ] Update `.mcp.json` to use `${CLAUDE_PLUGIN_ROOT}/bin/launch-trello-mcp.sh`
- [ ] Move Trello-related entries from this repo's `.claude/settings.json` into the
      plugin's `settings.json`
- [ ] Replace AGENTS.md cross-references in skill bodies with plugin-internal links
- [ ] Sanitize projitect-specific rules from `templates/builder.md` (Effect v4, pnpm-only)
- [ ] Write the plugin's `README.md` (prereqs + install + first-run + Trello-token walkthrough)
- [ ] In this repo, remove the now-extracted files and add the plugin via
      `/plugin install <plugin-source>`. Projitect becomes the first consumer.

Anything you'd want available across all consuming repos lives in the plugin; anything
specific to one repo's board layout or credentials stays in that repo's
`.claude/kanban.json` and `.env.local`.
