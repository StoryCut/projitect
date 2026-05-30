---
name: kanban-dump
description: Fast capture to the Brain Dump column. Add an idea with title + optional body in one shot, no refinement, no triage. Use this whenever an idea worth remembering comes up — during planning, while debugging, in standup. Refinement happens later via /kanban-triage and /kanban-refine.
---

# kanban-dump

The lowest-friction skill in the bundle. The goal is: capture > polish. If the user says
"oh, I should remember to fix the foo bar", you create the card and move on without
asking follow-up questions.

## When to invoke

Use whenever:

- The user types `/kanban-dump <text>` or `/kanban-dump`.
- The user says "remember to <thing>", "we should consider <thing>", "TODO: <thing>", "add
  to the backlog" (even though it goes to Brain Dump first — that's intentional).
- An agent (you, while doing something else) notices something worth flagging that doesn't
  belong in the current task — drop it here instead of derailing.
- The user just finished [`/grill-me`](../grill-me/SKILL.md) and its summary's "Suggested
  next step" line proposes `/kanban-dump "<thesis>"`. The thesis is your title.

Do not use this for:

- Adding to columns past Brain Dump — use `/kanban add` for direct-to-Backlog, but prefer
  the dump-then-triage flow.
- Capturing during a `/kanban-run` orchestration — the orchestrator has its own "follow-up
  card" hook; calling `/kanban-dump` from inside it would race.

## Preflight

```bash
test -f .env.local && test -f .claude/kanban.json || {
  echo "Kanban not set up for this repo. Run /kanban-init (or see SETUP.md if creds are missing)."
  exit 1
}
```

## Steps

### 1. Parse the input

If the user invoked with args (`/kanban-dump fix the stale tsconfig refs`), use the args as
the title. Strip leading verbs like "fix", "add", "consider" only if doing so would NOT
change meaning — leave them in if they're load-bearing.

If invoked with no args, ask once via AskUserQuestion (`Title?`). After that one question,
stop — don't drill for description, labels, etc. That's what triage is for.

### 2. Resolve the Brain Dump list id

```bash
BRAIN_DUMP_ID=$(jq -r .lists.brainDump .claude/kanban.json)
```

### 3. Create the card

Use `mcp__trello__add_card_to_list` (or the REST equivalent). Body:

- `name`: the title from step 1
- `desc`: a minimal scaffold using the description schema from
  [shared.md → Card description schema](../kanban/shared.md#card-description-schema):

  ```markdown
  ## Summary

  <empty — fill in during refine>

  ## Acceptance criteria

  - [ ] <empty>

  ## Depends on

  - none

  ## Plan

  _not planned yet_

  ## Implementation notes

  _not implemented yet_

  ## Test results

  _not tested yet_

  ## Meta

  - level: L2
  - plan_review_attempts: 0
  - impl_review_attempts: 0
  ```

  If the user provided a longer message (e.g. `/kanban-dump fix the stale tsconfig refs.
affects packages/core and the build`), put everything after the first sentence into the
  Summary section.

### 4. Add the signed creation comment

Per [shared.md → Signed-comment format](../kanban/shared.md#signed-comment-format):

```
> **/kanban-dump** · human · <ISO 8601 UTC>

Captured to Brain Dump. <Original input verbatim if not already the title.>
```

### 5. Report back

One line to the user: `Captured as #<card-id>: <title>. Triage with /kanban-triage when
ready.`

Don't print the card URL unless the user asks — they're in the middle of something else,
keep it tight.

## What this skill never does

- **Never asks for more than the title.** Triage is for fleshing out.
- **Never adds labels or sets priority.** Brain Dump is unsorted by design.
- **Never moves a card.** Capture only.
- **Never warns about duplicates.** Triage handles dedup. If you've seen 4 cards about
  "tsconfig refs" recently, that's a sign to run triage, not to gate dump.

## Failure modes

- **MCP not loaded** → fall back to REST per [shared.md → Falling back](../kanban/shared.md#falling-back-to-direct-rest).
- **Trello 5xx** → retry once after 1s, then surface the error. The user can re-dump later;
  no big loss.
