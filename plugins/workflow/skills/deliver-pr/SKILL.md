---
name: deliver-pr
description: Take a task from ticket to an open, review-ready pull request the way I work: ticket and design first, a correctly named branch from the right base, commits authored by me and committed by Claude, tests and docs green, a PR with the right base, labels and description. Use when asked to implement, fix or ship something that ends in a PR, or to "open a PR" for work already done.
---

# Deliver a change as a pull request

The project's own rules win wherever they say something different: read the root and per-folder
`AGENTS.md` / `CLAUDE.md`, any `.claude/engineering-rules.md`, `CONTRIBUTING.md` and the PR template
first. What follows is the default when a project says nothing.

## 1. Before any code

- **Ticket first.** The task has a ticket with acceptance criteria (in the project's tracker, or the
  tracker page or doc the project uses). No ticket: write one and show it before starting. Put the
  ticket id in the branch description, commits and PR.
- **Design first for anything a customer sees.** Screens, emails, texts, flows: a mock-up (screenshots
  or an artifact) approved by me before it is built. Back-end-only work skips this.

## 2. Branch

- From the project's integration branch (for example `staging`; `main` only if that is where PRs go).
  An urgent production fix bases on the production branch.
- Name: `<type>/<scope>-<short-description>`, lower case with hyphens:
  `fix/vin-anthropic-key-no-fallback`, `feat/report-section-icons`. Types: `feat`, `fix`, `chore`,
  `docs`, `test`, `revert`, `hotfix`. One branch per task. No session ids or generated names
  (`claude/modest-faraday-d7jkuv`); if the session started on such a branch, create the proper one.

## 3. Commits

- **Author: me. Committer: Claude.** GitHub checks a signature against the committer, so Claude's
  signature keeps the commit Verified while it stays under my name. Never make me the committer:
  Claude can't sign as me, and the commit shows Unverified.
  ```bash
  GIT_AUTHOR_NAME="<my name>" GIT_AUTHOR_EMAIL="<my email>" \
  GIT_COMMITTER_NAME="Claude" GIT_COMMITTER_EMAIL="noreply@anthropic.com" git commit ...
  ```
  My name and email: from the project rules, else my git identity on the account this session runs
  for. If unsure, ask once.
- Conventional Commits: `type(scope): what changed`, body says why, ticket id in it. Keep the
  attribution trailers the session asks for.
- No `--no-verify`, no hook bypasses. Use `git -C <dir>` rather than `cd` before git when a guard hook
  checks the repository.

## 4. Before opening the PR

- The touched sub-projects' tests, lint and formatter pass (commands from `AGENTS.md`). A failure that
  also fails on the base branch: say so in the PR, don't hide it or fix it in passing.
- Instruction files updated where the change made them stale (`workflow:update-agents-md`).
- A change in an app with a near-copy elsewhere: sibling checked (`workflow:mirror-sibling-change`).
- User-facing text: in **every** language the project ships, and following its wording rules.
- Only what the ticket asks. Anything else noticed: its own ticket and one line in the PR description.

## 5. The PR

- Base: the integration branch from step 2.
- Labels: a type label (`enhancement` or `bug`, or the project's equivalents) plus the label that
  starts automated review (for example `claude-review`). The label starts the review. **Never post an
  "@claude review" comment.**
- Title = the main commit's subject. Description: Problem, Fix, Testing (what ran, results, known
  pre-existing failures), Not in this PR. Follow the project's PR template headings if it has one.
  Link the ticket (`Closes #123` or the tracker id).
- Draft only if asked: a draft skips label-triggered review until it is marked ready.

## 6. After opening

- Add the PR number to the ticket and move it to In progress.
- Answer the review with `workflow:answer-review`, round after round, until no review blocks.
- **I merge.** Never approve or merge yourself. After the merge the ticket goes to Done with its PR
  number; it goes to Tested only after I've checked it on staging.
