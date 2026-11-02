---
name: resolve-pr-conflicts
description: Resolve a pull request's merge conflicts with its base branch safely — full history first, merge not rebase on someone else's branch, keep both sides' intent, re-apply the PR's purpose to code that arrived from the base, run the tests, push. Use when asked to fix, resolve or update a PR that "has conflicts" or is behind its base.
---

# Resolve a PR's merge conflicts

## 1. Get the real picture first

- **Full history.** In a shallow clone (`git rev-parse --is-shallow-repository` prints `true`), the
  merge base is wrong and git reports conflicts in hundreds of files the PR never touched. Run
  `git fetch --unshallow origin <base> <head>` (or a bounded `--depth=` fetch big enough to reach the
  merge base) before anything else, then check `git merge-base --is-ancestor <pr-base-sha> origin/<base>`.
- `git log --oneline origin/<base>..origin/<head>` should list only the PR's own commits. If it lists
  far more, history is still incomplete — or the base was rewritten; stop and tell the user.

## 2. Merge, don't rebase, unless the branch is yours

- On a branch someone else opened (or anyone else may have pulled), **merge** the base in. Rewriting
  history there (rebase + force-push) is not yours to do.
- Rebase only on your own branch, and only if the project prefers a linear history.
- Follow the project's commit-author rules (see its `AGENTS.md` / contributing docs) for the merge
  commit.

## 3. Resolve each conflict by intent

For every conflicted file, read both sides and the merge base (`git show :1:<f>`, `:2:`, `:3:`):

- **Both added different things** (tests, list entries, locale keys) → keep both, in a sensible order.
- **The base rewrote the code the PR changed** → take the base's new code, then re-apply the PR's
  change to it. Don't drop the PR's intent, and don't resurrect the old code.
- **Same line, different values** → work out which one is the newer decision (commit messages,
  tickets); ask the user if it's genuinely ambiguous.

Then check the **auto-merged** files too: code that arrived from the base may need the PR's change as
well. A PR that translates hard-coded text, renames an API or adds a guard everywhere has to cover the
new code from the base, or the PR ships with a gap nobody sees in its diff.

## 4. Verify, then push

- No markers left: `git diff --check` and `grep -rn '^<<<<<<<\|^>>>>>>>' <files>`.
- Run the touched sub-projects' tests and formatter from the project's `AGENTS.md`. A failure that
  also fails on the base branch is not caused by the merge — say so rather than "fixing" it here.
- Commit with a message listing each conflict and how it was resolved, plus anything adjusted in
  auto-merged files. Push to the PR's own branch (normal push, no force).
- Report: number of real conflicts, how each was resolved, test results.
