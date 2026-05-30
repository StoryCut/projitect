---
name: kanban-triage
description: Walk through Brain Dump cards one at a time and decide per card — promote to Backlog (with optional refinement), merge into an existing card, refine in place, or archive. Every decision requires human approval and leaves a signed comment trail. Designed for periodic batch triage rather than constant interruption.
---

# kanban-triage

Brain Dump is meant to be messy. Triage is the process that turns mess into a prioritized
Backlog. Run this when Brain Dump has accumulated ~5+ cards or feels stale, not on every
new dump.

## When to invoke

- The user says "triage", "/kanban-triage", "clean up brain dump", "process the inbox".
- `/kanban` reports Brain Dump has >10 cards.
- The user is starting a planning session and wants the Backlog fresh.

Skip when:

- Brain Dump is empty. Tell the user "nothing to triage" and stop.

## Preflight

Standard kanban preflight (see [kanban/SKILL.md → Preflight](../kanban/SKILL.md#preflight-every-subcommand)).

## Steps

### 1. Fetch every card in Brain Dump

```bash
BRAIN_DUMP_ID=$(jq -r .lists.brainDump .claude/kanban.json)
BACKLOG_ID=$(jq -r .lists.backlog .claude/kanban.json)
```

Pull every card with its description + last 3 comments (recent context matters; full
history is overkill for triage).

### 2. Fetch Backlog summary

Also pull every card title (and ID) currently in Backlog. You need this to spot duplicates
or merge candidates.

### 3. Walk cards one at a time

**Process in card-creation order (oldest first).** Each card gets a single AskUserQuestion
with these options:

- **Promote to Backlog** — moves as-is, asks one follow-up: pick a priority label (high /
  medium / low / no label).
- **Refine, then promote** — chain into `/kanban-refine` (which has its own approval gate)
  and then re-ask the user about promotion after the refinement lands.
- **Merge into existing** — present the user with the top 3 Backlog candidates (by string
  similarity to the dump card's title); user picks one, or types `other` and provides the
  target card id. The dump card is archived; a comment is appended to the merge target.
- **Refine in place** — keep the card in Brain Dump; chain into `/kanban-refine` to flesh
  it out. Use this when the card might be valuable but isn't ready for Backlog.
- **Archive** — `mcp__trello__archive_card`. No promotion, no merge.
- **Skip for now** — leave the card where it is, move on.

Before showing the question, print the card title + a 1-line summary of its description so
the user has context without having to click into Trello.

### 4. Log every decision

After the user picks, append a signed comment to the affected card (the dump card always;
the merge target on a merge):

```
> **/kanban-triage** · human · <ISO timestamp> · <decision>

<For "promote": "Promoted to Backlog with priority <X>.">
<For "merge": "Merged into #<id> — <duplicate-or-related rationale in user's words if any>.">
<For "refine in place": "Held in Brain Dump for refinement — <rationale>.">
<For "archive": "Archived — <rationale, 1 line>.">
<For "skip": skip the comment, no decision logged.>
```

Archive after the comment (Trello's archive doesn't delete the card, so the comment trail
is preserved if the user later restores it).

### 5. Loop until done

After each card, ask if the user wants to continue (`Next card?`) or stop here. Don't bulldoze
through 30 cards if the user's attention has wandered — surface that they can resume later by
re-running `/kanban-triage`.

### 6. Final summary

Print a one-block summary of what happened:

```
Triage complete.
  Promoted: <N> (high: <a>, medium: <b>, low: <c>, no-label: <d>)
  Merged:   <N>
  Refined in place: <N>
  Archived: <N>
  Skipped:  <N> (remaining in Brain Dump)
```

## What this skill never does

- **Never moves a card without explicit human approval.** Every transition asks. No "auto
  promote everything with the word 'bug' in it" shortcuts.
- **Never archives without a comment.** Future-you reading the audit trail needs to know
  why.
- **Never deletes a card.** Archive only. Trello archives are reversible.
- **Never edits the card description during triage.** That's `/kanban-refine`'s job —
  triage is "where does this go", not "what is this".
- **Never auto-merges on string similarity.** The user picks the merge target.

## Failure modes

- **AskUserQuestion times out / user disengages mid-triage** → leave the partially-processed
  state as-is. The committed decisions are already logged via comments. Next run picks up
  where this left off.
- **Trello move fails (rare)** → retry once. If it fails again, log the failure as a comment
  and skip to the next card.
