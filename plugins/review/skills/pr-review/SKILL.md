---
name: pr-review
description: Review a pull request (or several) the way this team already reviews — against the project's own rule files and the review history on its recent PRs — then post verified Important / Nit findings as inline comments with a count summary. Use when asked to review a PR, "review all open PRs", re-review after a push, or when the CI review bot is down. Works in any repository; it reads the project's rules instead of carrying them.
---

# PR review

One review per PR: a short summary that opens with the count (`` `1 important, 2 nits` ``,
`` `0 important, 3 nits` `` or `` `No blocking issues.` ``), then one inline comment per finding.
Every finding is something you **checked in the code**, not a suspicion.

Arguments: a PR number, several numbers, `all`, or nothing (the PR for the current branch). Add
`--dry-run` to report findings in chat without posting.

**`all` means my PRs only**: every open, non-draft PR opened by the person you work for (their
GitHub login). Never review or comment on a PR someone else opened unless the person names that PR
explicitly, even when it carries the review label.

## 1. Learn the project before reading the diff

Read, in this order, whatever exists — they outrank anything in this skill:

1. The repo's instruction files: root `CLAUDE.md` / `AGENTS.md`, and the `AGENTS.md` / `CLAUDE.md`
   inside every folder the diff touches. Project-specific rules ("keep new entities out of X",
   "every text in all 9 languages") are the highest-value checks — quote them when you cite them.
2. A rules contract if there is one (e.g. `.claude/engineering-rules.md`): its rule tags
   (`[safety]`, `[privacy]`, `[reversibility]`, `[contracts]`, `[scope]`, `[clarity]`, …) and the paths
   it names under each. A finding anchored to a tag can be Important; one with no anchor is a Nit at most.
3. An anti-pattern registry (e.g. `.claude/anti-patterns.md`): scan the diff for each entry's
   "How to spot it".
4. **The review history.** Read the last ~10 merged PRs' reviews and inline comments
   (`gh api repos/{owner}/{repo}/pulls/{n}/reviews` and `/comments`). Note what reviewers flagged,
   what authors fixed and what they pushed back on. Match that bar: if the team routinely fixes
   missing locale keys, flag them; if a kind of comment was always dismissed, don't raise it.
5. For a re-review: this PR's own earlier threads. Never repeat a comment that is still open; say in
   the summary which earlier findings the new commits fix.

## 2. Get the real diff

- Make sure history is complete before you diff: in a shallow clone (`git rev-parse
  --is-shallow-repository` prints `true`) run `git fetch --unshallow origin <base> <head>` first,
  otherwise the merge base is wrong and the diff includes thousands of unrelated lines.
- Diff `origin/<base>...origin/<head>` (three dots). Merge commits from the base branch are not the
  author's change: review the PR's own commits plus the conflict resolutions in its merge commits.
- Size it: a docs or copy change gets a quick pass; anything touching a path the contract lists
  under `[safety]` / `[privacy]` / `[reversibility]`, auth, money, paid APIs, schema or CI gets a deep pass.

## 3. Review

Walk the checks in [references/checks.md](references/checks.md): per file first, then across files
(producer vs consumer, the other half of a mirrored change, a spec that inventories routes or keys).
For each candidate finding, write down the concrete failure: **what input or state, what the user or
system then sees**. No failure scenario, no finding.

Run the project's own checks for the touched sub-projects (its test/lint command from `AGENTS.md`
or the contract) when they run in under a few minutes. If a failure is already on the base branch,
say so instead of blaming the PR.

## 4. Verify every finding

Before keeping a finding, try to disprove it: open the callee, the caller, the guard two files away,
the test that might already cover it, the base branch. Drop it if any of these holds:

- a guard elsewhere already handles it;
- it is pre-existing and the PR does not make it worse (mention it in one line at most);
- it is a preference that no project rule, test or user-visible behaviour backs;
- you could not point at a line.

Then classify:

- 🔴 **Important** — ships a bug, a regression, a security/privacy/money problem, a broken rule the
  project wrote down, or a red CI check. Blocking.
- 🟡 **Nit** — worth fixing, not blocking: a missing test that would catch a regression of *this*
  change, a gap in a pattern the PR otherwise follows, a stale doc, an unclear name.
- Anything below a Nit is not posted.

## 5. Write it

Follow [references/format.md](references/format.md) exactly — summary, inline comments, tone. Plain
language, the concrete scenario, the fix (a `suggestion` block when it is a line or two), and the
footer. One finding per comment, anchored to the line it is about.

## 6. Post

- Post one review per PR with all inline comments in it (create a pending review, add the comments,
  submit). Use event `COMMENT`. Never approve, never merge, never resolve someone's thread.
  Use `REQUEST_CHANGES` only when the user asked for blocking reviews.
- If a line can't take an inline comment (outside the diff), put that finding in the summary under
  its file name.
- `--dry-run` or "just tell me": print the same summary and comments in chat instead.
- With several PRs, review them independently (in parallel if you can) and report one line per PR at
  the end: number, title, count, link.
