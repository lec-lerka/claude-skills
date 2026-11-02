---
name: staging-retest-plan
description: Keep one staging retest plan page up to date with what to check, ticket by ticket, for every PR merged to staging that isn't tested yet. Update the existing plan rather than making a new one: add sections for new merges, refresh sections a later PR changed, and remove the parts that already passed and are marked Tested. Also handles "done testing": read the results and mark tickets Tested. Use when asked for a retest or test plan, after a batch of merges, or when the person says they finished testing.
---

# Staging retest plan

**One living plan per project.** Find it (`AGENTS.md` / `.claude/planning.json` `{"retestPlan": "<url>"}`,
or the person's artifacts titled "Retest Plan" / "Test Plan"; the newest that isn't marked as
replaced). Update it in place at the same URL. Make a new page only if none exists. An older plan
that the current one says it replaces is a candidate for `planning:artifact-cleanup`; never delete it
from here.

Read the plan (Artifact `read`, the saved full HTML) and learn its format from what is there. A common
shape:

- In the source: a `FIXES` object with one section per ticket, plus `GROUPS` (themed groups in run
  order), `FINDS` (problems found → their tickets), `AUTO_TOP` and `VINS` (test data). A section has
  `tickets[]`, `title`, `pri`, `prs[]`, `what`, `need`, `auto[[pass|fail, text]]`, `gaps[]` and
  `checks[]`, and each check has `id` ("13.2"), `title`, `who`, `data`, `steps[]`, `expected` and
  `optional`.
- Results in the shared database: collection `results`, document id = check id with `.` → `-`,
  `{step, result: pass|fail|null, note, by, at}`.
- The tracker's `tickets/<id>` documents: `{status, tested, prs}`.

## Update the plan

1. **What's on staging**: `git fetch` the integration and production branches. PRs merged since the
   last release: `git log --merges --first-parent origin/<production>..origin/<staging>`. Their ticket ids
   come from the PR titles, bodies and branch names. Check that the staging deploy includes the last
   merge (build commit or image tag after it), and say if it doesn't.
2. **Sort each ticket** against the tracker and the results:
   - **Tested** (`tested: true`), or every required check in its section passed and none failed →
     **remove its section** from the plan. Results stay in the database as the record.
   - **In the plan, untested or failed** → keep it. If a newer PR touched the same ticket or the same
     area, rewrite the steps and expected results to match the code now. Mention it in the section
     ("updated for #962"), and clear that section's stale results only if the old steps no longer apply.
   - **Merged but not in the plan** → add a section.
   - **Failed checks** → keep them. Each failure note becomes a ticket (`planning:write-ticket`) unless
     it already points at one; list it in `FINDS`.
3. **Write each new or updated section** from the PR diff and the ticket's acceptance criteria:
   - `what`: what changed, in user terms. `need`: the accounts, data and setup it needs.
   - checks: one observable behaviour each, with the exact URL or screen, account/role (`who`), data
     (VIN, order), steps a tester can follow without reading code, and the `expected` result. Cover
     each acceptance criterion, the edge case the PR fixed, and one "nothing else broke" check
     nearby. Languages: name which language to switch to when text changed.
   - `auto`: what you verified yourself (API calls on staging with a test account, unit tests, the
     build), marked pass or fail. Never put passwords, tokens or customer data in the page.
   - Check ids follow the section number, and existing ids never change: results are keyed by them.
4. Put the sections in run order inside the plan's groups, update the date, the staging commit and any
   counts in the header, and republish to the same URL (merge with the live version on conflict).
5. Report: sections added, updated and removed, with ticket ids, and what's waiting on the person
   (access, data, decisions).

## "Done testing"

Read the `results` collection. For each ticket whose required checks all passed and none failed: set
`tested: true` on `tickets/<id>`, written with `if_version`, and only for tickets whose status is
`done`. For each failure: a ticket from its note, linked from `FINDS`. Then run **Update the plan**
again, so the tested sections disappear. Report which tickets became Tested and which failed.
