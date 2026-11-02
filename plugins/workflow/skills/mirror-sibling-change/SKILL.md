---
name: mirror-sibling-change
description: After a fix or feature in one app, package or service that has a near-copy elsewhere in the repo (two frontends, two API clients, web + extension, a forked module), check whether the sibling needs the same change and port it test-first. Use after finishing a change in any part of a repo that duplicates code instead of sharing a package.
---

# Mirror a change to the sibling

Repos often hold two copies of the same thing — a customer and an admin frontend, a web app and an
extension, two services with a copied client — with **no shared package** between them. A fix in one
does not reach the other, and the sibling is easy to forget.

## Steps

1. **Find the siblings.** Read the root `AGENTS.md` / `CLAUDE.md` / README: it usually names apps that
   share patterns. Otherwise look for folders with the same structure (`src/services`, `src/guards`,
   the same file names). No sibling with an equivalent file or behaviour → stop and say so.
2. **Find the equivalent code** (same path, same function, same interceptor or validator) and check
   whether it has the same bug or lacks the same feature.
3. **If it needs the change:** write the failing test in the sibling first, in that sibling's own test
   style, confirm it fails, then port the fix. Keep the same shape as the original unless the sibling
   has a structural reason to differ — and say so if it does.
4. **If it intentionally should not get it** (a feature only one side has), say that explicitly.
   Skipping silently is the failure this skill exists to catch.

## Verify

- Both sides' test suites pass.
- The PR description or commit says the sibling was checked and the result: mirrored, not
  applicable, or intentionally different (and why).
