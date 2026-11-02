---
name: release-pr
description: Write the release pull request from the integration branch to production (e.g. staging → production): the tickets and PRs included, database migrations, new or changed env vars, secrets and feature flags, dependency and infrastructure changes, risky changes with what to watch, test status, and rollback notes. Use when asked to prepare a release, a production PR or release notes.
---

# Release PR

Branches come from the project's rules (`AGENTS.md`, `.claude/engineering-rules.md`): the integration
branch (e.g. `staging`) and the production branch (e.g. `production` or `main`). Fetch both with
full history: `git fetch --unshallow` if the clone is shallow.

## 1. Collect

- **PRs**: `git log --merges --first-parent --format='%h %s' origin/<prod>..origin/<staging>`, plus
  direct commits on the integration branch (`--no-merges --first-parent`). Leave out bot commits such
  as image-tag updates, but count them as deploys. If an open release PR already exists, update it
  rather than opening another.
- **Tickets**: ids from PR titles, bodies and branch names, matched to the tracker (status, Tested)
  and the retest plan (results). A ticket without a Tested mark is **not verified on staging**: say so.
- **Diff by risk**: `git diff origin/<prod>...origin/<staging> --stat`, then look specifically at:
  - **migrations**: new files in the migrations folder. Name each one, say what it changes, whether
    it's reversible, whether it locks or rewrites a big table, and whether the code needs it before
    the new pods start;
  - **config**: new or renamed env vars (the constants or config module, `.env.example`, k8s
    deployments, secrets and config maps), new secrets that must exist in production **before** the
    deploy, and feature flags or kill switches with their default values;
  - **dependencies and runtime**: lockfile major bumps, Node/Python version changes, Dockerfiles, CI
    workflows, k8s resources or HPA;
  - **risky surfaces** from the project's `[safety]`, `[privacy]` and `[reversibility]` rules: payments,
    credits, auth and permissions, LLM and other paid calls, outbound email, schedulers and queues,
    data deletion, public routes, SEO and sitemaps;
  - **API contract** changes another app or an external client relies on.

## 2. Write the PR

Title: `Release <date>: staging → production` (or the project's convention). Body:

```
## Summary
<2–3 sentences: what users get in this release>

## Included
| Ticket | Title | PR | Tested on staging |
|---|---|---|---|
| SC-QA-132 | Invalid VINs out of the VIN sitemaps | #962 | ✅ |
| SC-QA-128 | Car photo in the upgrade email | #960 | ❌ not yet |

## Before deploying
- [ ] Secret `X` exists in production
- [ ] Env var `Y` set (default: …)

## Migrations
- `1730000000000-AddInspectionOverview`: adds table `inspection_overview`; reversible; no lock on large tables

## Config and flags
- `VIN_SITEMAP_BATCHES_ENABLED` (new, default `true`): turns the sitemap job off

## Risky changes: what to watch after deploy
- Upgrade email (#960): outbound email to customers. Watch SendGrid bounces and the `upgrade-offer` logs for an hour.

## Rollback
<revert the merge, plus anything a revert does not undo: migrations to run down, flags to flip, data written>

## Not tested / known issues
<tickets without Tested, failing checks, known flaky tests>
```

Leave out the sections that are empty, except "Not tested", which says "none" when there's nothing.
Follow the project's PR template headings if it has one.

## 3. Deliver

- Show the description first if the person didn't ask you to open the PR. When they ask, open it
  with base = production branch and head = integration branch, with the project's labels. Never merge
  it, and never push to either branch.
- A release with an untested P1 ticket, a migration that isn't reversible, or a missing production
  secret: say so at the top, not only in the body.
