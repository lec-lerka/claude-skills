---
name: watch-prs
description: Watch my open pull requests and keep them moving — subscribe to their activity, wait for each review to finish completely, then answer it, fix red CI, resolve merge conflicts, and report; never merge. Use when asked to watch, monitor, babysit or autofix PRs, or right after opening a PR when I want it followed.
---

# Watch my PRs

## Which PRs

My PRs only: the ones I name, or every open PR I opened (my GitHub login) when I say "watch my
PRs". Never watch or act on someone else's PR unless I name it. Subscribe to each one's activity
(`subscribe_pr_activity`) and then **stop and wait**: events wake the session. Don't poll with
`sleep` or repeated status calls.

## On each event

1. **A review started or a comment arrived: wait for the whole review.** Do nothing until the review
   run is `completed` and its summary (the `` `N important, M nits` `` review) is posted for the
   current head commit, or the human reviewer has submitted. Partial comments are not the review.
   Then follow `workflow:answer-review` once, for the whole review.
2. **CI red**: reproduce the failure locally first, fix only what it needs, and show the same check
   passing before you push. A failure that also happens on the base branch: say so, don't "fix" it
   here. Never skip, disable or weaken a test to get green.
3. **Merge conflict**: `review:resolve-pr-conflicts`. Merge the base in, never force-push.
4. **The review run never starts or ends without a review** (queued for a long time, cancelled,
   skipped): don't push empty commits or close and reopen the PR. Check why (runner offline, a bot
   actor, the label missing, a draft) and tell me.
5. **Merged or closed**: unsubscribe, move the ticket (Done, with the PR number), and if a retest plan
   exists, note it for `planning:staging-retest-plan`.

## Rules that always hold

- Wait for the whole review before acting on any of it, every round.
- One push per review round, containing all the fixes for that round. Each push starts a new review,
  so batching keeps reviews and fixes in step.
- Commits are authored by me and committed by Claude (`workflow:deliver-pr`). No force push, no
  rebase of a branch under review.
- Never approve, merge or resolve someone else's thread. I merge.
- Security and privacy findings stay open for me to decide.
- If I say stop: unsubscribe from every PR and push nothing more.

## Report

After each round: the PR, what the review found (the count line), what you fixed (commits), what you
answered without a change, what waits for me, and whether the next review run has started.
