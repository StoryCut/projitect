---
name: kanban-run
description: Full pipeline orchestrator. Walks one card from Backlog through Plan, Plan Review, Impl, Impl Review, Test, to Done. Dispatches Planner / Critic / Builder / Inspector / Tester subagents using the prompt templates in kanban/templates/. Asks the human via AskUserQuestion before every transition — no auto mode. Designed to be the primary way the user drives implementation through the board.
---

# kanban-run

The orchestrator. Every transition between columns goes through a human approval gate. Even
the forward ones. The user can approve, reject (stay), or roll back at every step. This skill
is the embodiment of "humans in the loop at every step" — the literal interpretation of the
brief.

## When to invoke

- The user says "/kanban-run <id>", "implement <id>", "ship <id>", "let's work on <id>".
- The user types `/kanban-run` with no card id — present the top of the Backlog (per
  current `pos`) and ask which card to run.

Skip when:

- The card is in Brain Dump — run `/kanban-triage` (or `/kanban-refine` then promote) first.
- The card has no acceptance criteria — chain to `/kanban-refine` first, then resume.
- The card has unresolved `Depends on:` cards still in pre-Plan columns — surface the
  dependency and stop. (Run them first.)

## Preflight

Standard kanban preflight, plus:

```bash
CARD_ID="$1"
# Board-scope guard
# Fetch card; confirm it's in Backlog
# Parse description: must have ## Acceptance criteria with ≥1 checkbox
# Parse Depends on: each id must already be in Done (or be "none")
```

## Pipeline overview

```
Backlog ─[A]→ Plan ─[B]→ Plan Review ─[C]→ Impl ─[D]→ Impl Review ─[E]→ Test ─[F]→ Done
                  ↑              ↓                ↓              ↓
                  └── retry ─────┘                └── retry ─────┘
                       (max 3 each — circuit breaker per cyanluna)
```

Gates A through F are all human-approved.

## Steps

### A. Backlog → Plan

Before any agent runs:

1. Show the card to the user (title, summary, AC, level, deps).
2. AskUserQuestion: **Proceed (start Planner)** / **Refine first** / **Cancel**.

If proceed:

3. `mcp__trello__move_card` to Plan list.
4. Append `> **Human decision** · <ts> · backlog → plan` comment.
5. Render `kanban/templates/planner.md`, substituting:
   - `<CARD_ID>`, `<CARD_TITLE>`, `<CARD_BODY>` from the fetched card
   - `<MODEL>` from your current model id
   - `<ISO_TIMESTAMP>` from `date -u +%Y-%m-%dT%H:%M:%SZ`
   - `<DEPENDS_ON_SUMMARY>`: for each dep id, the dep's title + completion status
6. Dispatch via the Task tool (`Agent` with `subagent_type: general-purpose`). The Planner
   writes its plan to the card and posts a signed comment.
7. Wait for the dispatch to return. Read the latest plan comment.

### B. Plan → Plan Review

1. Re-fetch the card. Verify the Planner posted a "plan complete" comment (not "cannot
   plan — need clarification" — that's a roll-back signal; handle below).
2. AskUserQuestion: **Proceed (start Critic)** / **Re-run Planner** / **Roll back to Backlog**
   / **Override: approve plan as-is and skip Critic** (for L1 cards).
3. If proceed: move to Plan Review list, comment, dispatch Critic via the
   `kanban/templates/critic.md` template. Increment the attempt counter in `## Meta`.
4. Wait. Read the critic's verdict.

If the Planner returned "needs clarification": skip the Critic, surface the clarifying
questions to the user, and roll back to Backlog with a comment recording the questions.

### C. Plan Review → Impl

After the Critic returns:

1. Show the user the critic's scores + decision.
2. AskUserQuestion:
   - If Critic said **approve**: **Approve and start Builder** / **Reject (re-run Critic)** /
     **Roll back to Plan**
   - If Critic said **request-changes**: **Roll back to Plan (re-plan)** / **Override and
     approve anyway** / **Cancel**

3. If approving and proceeding to Impl: move card to Impl, comment, dispatch Builder using
   `kanban/templates/builder.md` with the approved plan as `<APPROVED_PLAN>`.

**Circuit breaker**: if `plan_review_attempts` is already 3, do NOT auto-offer re-run.
Hard-stop and surface to the user: "This is the 3rd plan-review attempt. Something is
fundamentally wrong with the plan or the card. Recommend rolling back to Backlog for
refinement."

### D. Impl → Impl Review

After the Builder returns:

1. Re-fetch the card. If the Builder posted "needs replan", handle like §B's clarification
   case — roll back to Plan, comment with the Builder's reason.
2. Otherwise, AskUserQuestion: **Proceed (start Inspector)** / **Re-run Builder** /
   **Roll back to Plan**.
3. If proceed: move to Impl Review, comment, render
   [`kanban/templates/inspector.md`](./../kanban/templates/inspector.md) with `<DIFF>` from
   `git diff` (capture the working-tree diff, not committed). Dispatch the Inspector.

### E. Impl Review → Test

After the Inspector returns:

1. Show the user the inspector's scores + decision.
2. AskUserQuestion (same shape as gate C — approve/reject/roll-back/override).
3. If approving: move to Test, comment, dispatch Tester using `kanban/templates/tester.md`.

**Circuit breaker**: `impl_review_attempts` ≥ 3 hard-stops, same as gate C.

### F. Test → Done

After the Tester returns:

1. Show the user the test results (pass/fail per gate).
2. AskUserQuestion:
   - If all PASS: **Approve to Done** / **Run a manual smoke first** / **Cancel (stay in
     Test)**
   - If any FAIL: **Roll back to Impl** / **Override (mark Done despite failures — capture
     reason)** / **Cancel**

3. If approving to Done: move card to Done. Append the final comment:

   ```
   > **Human decision** · <ts> · test → done

   Approved. <Brief — what shipped, link to commit if user committed.>
   ```

4. **Do NOT commit automatically.** Ask the user if they want to commit now. If yes, run:

   ```bash
   git add <files from card's ## Implementation notes>
   git commit -m "<conventional commit subject> [kanban #<CARD_ID>]"
   ```

   The `[kanban #<ID>]` suffix ties the commit to the card (cyanluna pattern). Use the
   conventional-commits format from [AGENTS.md → Commits and PRs](../../../AGENTS.md).

## What this skill never does

- **Never skips a gate.** No `--auto`, no `--yes`. If you find yourself wanting to bypass
  a gate, the answer is to edit the card to be smaller, not to bypass.
- **Never moves a card silently.** Every move has a signed comment.
- **Never commits without asking.** Even on full-green Test, the user explicitly approves
  the commit.
- **Never runs a subagent without rendering the template first.** The templates are the
  contract; ad-hoc prompts produce drift.
- **Never deletes the working-tree diff.** If the user rolls back from Impl Review or Test,
  the diff stays — the user decides whether to `git stash`, `git checkout`, or hand-edit.
- **Never proceeds past a circuit breaker (3 attempts) without explicit user override.**

## Failure modes

- **Subagent dispatch errors** (Task tool returns failure) → surface the error, ask the
  user: retry / roll back / cancel.
- **Card moved manually by user during the run** (someone drags it on Trello) → the next
  fetch will show a list mismatch. Stop, surface, ask the user to either resume from the
  new list or re-set.
- **`pnpm check-all` times out** (rare; smoke can take a while) → bump the Tester's timeout
  to 10 minutes; if still timing out, surface and ask whether to skip or wait longer.
- **Git working tree has uncommitted unrelated changes when reaching gate F** → warn the
  user; offer to stash unrelated changes before committing the card's diff.
