---
name: update-agents-md
description: Check whether the change just made leaves an AGENTS.md / CLAUDE.md / README stale, and update only what drifted. Use before finishing or delivering any feature or fix that touches behaviour, commands, config, file layout or a gotcha such a file documents.
---

# Keep the instruction files in sync with the change

`AGENTS.md`, `CLAUDE.md` and READMEs describe stack, module maps, commands and gotchas as of the last
time someone touched them. Nothing fails when they drift, so the check has to be deliberate.

## Steps

1. **Find the files that cover what you changed.** The nearest `AGENTS.md` / `CLAUDE.md` above every
   touched path (walk up to the repo root), plus the root file when the change is cross-cutting (a new
   sub-project, a repo-wide command or convention). If the root file says it is the source of truth and
   others mirror it, update both.
2. **Check each for drift:**
   - a documented command changed or a new one exists (test, build, migrate, lint);
   - a documented path, function, env var, config value or route was renamed, moved or removed;
   - a gotcha was fixed (remove it) or introduced (kill switch, pinned version, ordering requirement,
     workaround) — document it if the file already records that kind of thing;
   - a module map is missing a folder, service, entity or page this change added, or still lists one
     it removed.
3. **Update only what drifted.** No rewrites of unrelated sections, no roadmap notes — these files
   describe what is true now.
4. **If nothing drifted, say so** in the PR description or your summary ("AGENTS.md checked, still
   accurate"). The check is a recorded decision, not an assumption.

## Verify

- Every command, path and name the diff touches that also appears in an instruction file matches
  after your edit (`git grep` the old name — no hits left in docs).
