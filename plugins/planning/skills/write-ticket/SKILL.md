---
name: write-ticket
description: Turn a bug report, QA note, chat message or idea into a ticket with steps, expected result and acceptance criteria, and add it to the project's tracker page (or its issue tracker). Use when asked to "make a ticket", log a bug, file a finding from testing or review, or when work is requested that has no ticket yet.
---

# Write a ticket

## 1. Find the tracker

In order: the project's `AGENTS.md` / `CLAUDE.md` / `.claude/planning.json` (`{"tracker": "<artifact url>"}`),
then the person's artifacts (Artifact `list`, a title with "Tickets" or "Tracker"), then the project's
issue tracker (GitHub Issues). If more than one fits, ask once which one.

For a tracker **page**, read it first (Artifact `read`, and the full saved HTML it points at) and learn
its format from the existing tickets instead of assuming one. A common shape:

- Ticket text lives in the page source: a `TICKETS` array, one object per ticket, with `id`, `group`
  (`bug` / `change`), `type` (Bug / Change / Chore), `pri` (P1–P3), `area`, `title`, `found`, `context`,
  `steps[]`, `actual`, `expected`, `ac[]` and `notes[]`.
- Live state lives in the page's shared database: collection `tickets`, document id = ticket id,
  `{status: todo|doing|done, tested, prs[], by, at}`. A new ticket needs no document: no document
  means To do.

## 2. Write it

- **Check for a duplicate first.** Search the tracker for the same area and symptom. If it's already
  there, add to that ticket instead (a note, a step, a link).
- **id**: the highest existing id + 1, in the tracker's format (e.g. `SC-QA-140`). Never reuse one.
- **title**: what's wrong or what's wanted, from the user's side, in one line. Not the fix.
- **Bug**: `steps` that reproduce it from a clean start (account or role, URL, data such as a VIN or
  order), `actual`, `expected`, and where it was seen (`found`: who or what found it, and the date).
- **Change**: `context`, meaning who needs it and why, then what should change.
- **ac**: 2–5 checkable statements a tester can tick on staging, each one observable ("The Orders
  search returns jobs whose VIN contains the text"). Add "a test covers …" when the fix needs one.
- **notes**: the file and line if known, related tickets and PRs, decisions made, and open questions.
- **pri**: P1 = broken for customers or money/data at risk, P2 = wrong but has a workaround,
  P3 = polish. **area**: the app and the screen or module.
- Plain language. Code, keys and paths in backticks. No secrets, tokens or customer personal data:
  use a test account or the VIN only.

If it is too unclear to write acceptance criteria, write what you can, and put the question in
`notes`, or in the tracker's "needs clarification" list if it has one. Then ask the person.

## 3. Add it

- **Tracker page**: insert the ticket object in the `TICKETS` array, in the format of its neighbours,
  under a dated divider comment if the page uses them. Republish to the **same** URL (merge with the
  live version if the publish reports a conflict). Update any hand-written counts that list tickets.
  Don't write a `tickets` document unless the status is not To do.
- **Issue tracker**: create the issue with the same sections, and the project's labels and type.
- Report: the id, the title and the link. Show the ticket text if the person hasn't seen it.

Later status changes go through the database (`tickets/<id>`: `doing` when a PR opens, with `prs`,
then `done` on merge), written with `if_version`. `tested: true` is set only after the person (or a
retest plan run they reported) confirms it on staging.
