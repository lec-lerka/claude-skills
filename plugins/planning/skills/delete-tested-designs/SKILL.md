---
name: delete-tested-designs
description: Find design artifacts (mock-ups, canvases, design briefs, copy decks) whose tickets are Done and Tested on staging, keep anything still needed from them, unlink them from the tracker, and delete the ones the person confirms. Use when asked to clean up designs, after a retest marks tickets Tested, or as part of a regular artifact cleanup.
---

# Delete designs once they are tested on staging

A design page has done its job when what it designed is built, merged and **tested on staging**.
Until then it is the spec: never delete a design whose ticket is not Tested.

## 1. Find the designs and their tickets

- Artifact `list` (scope `mine`). A design is a canvas or mock-up page, or a design brief / copy deck
  doc: titles like "design", "mock-up", "layout", "redesign", "brief", or a screen or feature name.
  Read each one (`read`) before judging it.
- For each design, find its tickets:
  - ids it names (`SC-QA-27`);
  - tracker tickets whose `notes` / `context` link its URL (search the tracker source for the
    artifact id, the last part of the URL);
  - PRs it names, matched to tickets.
- Ticket state comes from the tracker's database (`tickets/<id>`: `status`, `tested`). A design with
  no ticket at all goes to **Ask**.

## 2. Sort

| Group | When | Proposal |
|---|---|---|
| **Delete** | every ticket it covers is `done` + `tested: true`, and it holds nothing still open | delete |
| **Keep** | any ticket is not Tested (To do, In progress, or Done but not yet Tested) | keep, and say which ticket blocks it |
| **Keep: reference** | it is the current source for something still evolving (a design system, a component library, a page other open designs build on) | keep |
| **Rescue, then delete** | Tested, but it holds open questions, decisions not recorded elsewhere, or follow-up ideas | move those into a ticket (`planning:write-ticket`) or into the live page they belong to, then delete |
| **Ask** | no ticket found, shared with other people, or has comments or a database with answers | ask the person |

Also check: is it used as the visual reference by an open design or ticket? Is a newer design for the
same screen still being worked on? If yes, keep it, or merge it into the newer one first.

## 3. Propose and wait

```
| # | Design | Tickets (state) | Why | Proposal |
|---|---|---|---|---|
| 1 | CheckVIN Upgrade to Complete | SC-QA-27 done+tested, SC-QA-15 done+tested | shipped (#878), nothing open | delete |
| 2 | Upgrade email design | SC-QA-128 done, not tested | waiting for the retest | keep |
```

The person picks ("delete 1", "all proposed"). Do the rescues first, then the deletes, one call each.

## 4. After deleting

- In the tracker, replace each link to a deleted design in the tickets' `notes` with a short record:
  "Design (deleted 2026-11-02): shipped in #878". Republish the tracker to the same URL so no ticket
  points at a dead link.
- Report: deleted, kept (with the blocking ticket), and rescued (with the new ticket ids).

Run this after each "done testing" in `planning:staging-retest-plan`: that is when designs become
deletable.
