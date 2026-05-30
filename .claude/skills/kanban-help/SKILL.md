---
name: kanban-help
description: Interactive wayfinder for the kanban workflow. Asks what you want to do via AskUserQuestion, gives you the exact recipe from docs/kanban/workflows.md, then stops so you can run it. Use when you're new to the kanban workflow or can't remember which command starts a particular scenario.
---

# kanban-help

A pure wayfinding skill. Routes the user to the right `/kanban-*` command(s) based on what
they're trying to do, with the recipe lifted from
[docs/kanban/workflows.md](../../../docs/kanban/workflows.md). The user runs the commands
themselves — this skill never invokes them.

## When to invoke

- The user says `/kanban-help`, "help with kanban", "what should I do", "how do I X with
  kanban", "remind me how to X".
- Any time someone is unsure which kanban command applies — better to land them in the right
  recipe than to let them guess.

Skip when:

- The user clearly knows the command — just suggest they run it.
- A `/kanban-run` is in flight; don't interrupt orchestration.

## How it works

Two questions, max. Then print the recipe.

### Step 1 — Bucket

Ask via `AskUserQuestion`: **"What do you want to do?"** with these four options:

1. **Capture an idea** — for new thoughts that should land on the board
2. **Work through the Backlog** — triage, refine, or re-rank
3. **Implement a specific card** — push something from Backlog (or earlier) toward Done
4. **Set up or troubleshoot** — first-time setup or something's broken

### Step 2 — Follow-up (per bucket)

Per the chosen bucket, ask one follow-up via `AskUserQuestion`:

#### Bucket 1: Capture an idea

> "Have you thought it through?"

- **Yes, just save it** → recipe §3
- **No, I want pushback first** → recipe §2
- **It came up while I'm doing something else** → recipe §4

#### Bucket 2: Work through the Backlog

> "What needs work?"

- **Brain Dump is too big — process it** → recipe §5
- **Backlog order is stale — re-rank** → recipe §6
- **A specific card is too thin — flesh it out** → recipe §7

#### Bucket 3: Implement a specific card

> "Where is the card right now?"

- **Backlog (ready to plan)** → recipe §8
- **Brain Dump (still raw)** → recipe §9 (full chain)
- **Mid-pipeline (Plan / Impl / Test)** → `/kanban-run <id>` resumes from its current column

#### Bucket 4: Set up or troubleshoot

> "Specifically?"

- **First-time setup on this machine** → recipe §1 + SETUP.md
- **Sanity-check that my setup still works** → `/kanban status`
- **Something is broken** → SETUP.md → Troubleshooting

### Step 3 — Print the recipe

After the follow-up, print:

1. The recipe's commands (3-5 lines max, exactly as in workflows.md)
2. A one-sentence explanation of what each command does (only if non-obvious)
3. A link to the relevant section of [docs/kanban/workflows.md](../../../docs/kanban/workflows.md)

Then stop. The user runs the commands. If they want the next step after running, they can
re-invoke `/kanban-help`.

### Example end-state

```
Recipe — Grill, then dump (workflows.md §2):

  /grill-me
  # then, when it proposes:
  /kanban-dump "<thesis from the grill summary>"

Full walkthrough: docs/kanban/workflows.md#2-grill-then-dump
```

## What this skill never does

- **Never runs the recipe.** Pure wayfinding. The user runs the commands.
- **Never asks more than two questions** (bucket + one follow-up). If two questions can't
  pin down the intent, the user knows their case better than the recipe map does — point
  them at workflows.md and let them browse.
- **Never invents recipes.** If the user's intent doesn't fit a documented workflow, say
  so and offer the closest documented one as a starting point.
- **Never duplicates the recipe text.** Pull from workflows.md by reference — that file is
  the source of truth. If the recipe is wrong here, fix workflows.md, not this skill.

## Failure modes

- **User's intent doesn't fit any bucket** → ask one free-text follow-up via the
  AskUserQuestion "Other" option, then either map their answer to an existing workflow or
  say "no canned recipe — here's the closest thing".
- **docs/kanban/workflows.md is missing or unreadable** → check whether the kanban bundle
  is installed. Point at `.claude/skills/kanban/SETUP.md`.
- **User loops back asking the same thing repeatedly** → they may want the skill to run the
  commands. Surface that this skill is wayfinding only and offer to invoke the suggested
  skill directly.
