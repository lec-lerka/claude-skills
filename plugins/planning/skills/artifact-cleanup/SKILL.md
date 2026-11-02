---
name: artifact-cleanup
description: Find old, unused and superseded artifacts (replaced plans, finished one-off reviews, duplicates, drafts) and stale local work (merged branches, worktrees, scratch files), show them as a list with a reason for each, and delete only what the person confirms. Use when asked to clean up, tidy, or delete old artifacts or pages, or after a plan or design has been replaced.
---

# Clean up artifacts and leftovers

Deleting an artifact is permanent and breaks its link for everyone. So this skill **proposes**, and
the person decides. Every delete is confirmed by the person, one by one or as a list they approved.

## 1. List and read

- Artifact `list` (scope `mine`, a high `limit`). Shared artifacts owned by others are never yours to
  delete. Note each one's title, URL and last update.
- For each candidate, read it (`read`) before judging. You don't delete what you haven't looked at.
  Look for a "replaced by" or "superseded" note, its date, the PRs or tickets it covers, and whether it
  has a shared database with results or answers in it.

## 2. Sort into four groups

1. **Keep, live tools**: trackers, process pages ("How we work"), dashboards, the current retest
   plan, design systems, anything pinned, anything updated in the last ~7 days, and anything linked
   from a page you keep (`grep` the kept pages' sources for the URL).
2. **Safe to delete**:
   - a page that says another one replaces it, when the replacement exists;
   - an older duplicate of the same title;
   - a review or design page for a PR that is merged or closed, or a ticket that is Done and Tested;
   - empty or "Untitled" drafts.
3. **Ask first**: has a shared database with results, notes or answers that aren't recorded elsewhere;
   is shared with other people; or you can't tell what it was for. Offer an export (a Markdown or JSON
   copy of its content and data, in a file) before deleting.
4. **Merge then delete**: two pages that cover the same thing. Move what's still useful into the one
   you keep (update it in place), then propose deleting the other.

## 3. Propose

Show one table and wait for the answer:

| # | Artifact | Last updated | Why | Proposal |
|---|---|---|---|---|
| 1 | Done Tickets Test Plan | 2026-10-23 | replaced by "Staging Retest Plan"; never run, no results | delete |
| 2 | PR 905 review: VIN log masking | 2026-10-27 | PR #905 merged | delete |
| 3 | Staging Fixes Checklist | 2026-10-21 | still the place for the SC-QA-02/04 checks | keep |

The person answers with numbers ("delete 1, 2"), "all proposed", or changes. Then delete exactly those,
one call each, and report what was deleted and anything that failed. Never delete outside the
approved list, and never "while you're at it".

## 4. Local leftovers (only if asked to clean the repo too)

- Worktrees: `git worktree list`, then remove the ones under scratch folders that no session is using
  (`git worktree remove`, then `git worktree prune`).
- Local branches already merged into the integration branch: `git branch --merged origin/<staging>`,
  excluding protected and current ones; delete them with `git branch -d` (never `-D` without asking).
- Remote branches: only list the merged ones. Deleting a remote branch is the person's call, and the
  project's guard may block it.
- Scratch files the session made: list them, and delete them after confirmation.
