# My Claude Code skills

A personal [Claude Code](https://claude.com/claude-code) plugin marketplace: one repo, every skill,
usable in any project. Skills here read each project's own `AGENTS.md`, `CLAUDE.md` and rule files
instead of carrying one project's rules.

| Plugin | What you get |
| --- | --- |
| `review` | `/review:pr-review` reviews PRs against the project's rule files and its review history: Important / Nit findings, each verified against the code, posted inline with a count summary (`--dry-run` for chat only). `/review:resolve-pr-conflicts` resolves a PR's conflicts with full history, merging rather than rebasing someone else's branch, and re-applies the PR's intent to code that came from the base. |
| `workflow` | `/workflow:deliver-pr` takes a task from ticket to a review-ready PR: ticket and design first, `<type>/<scope>-<description>` branch, commits authored by me and committed by Claude (so they stay Verified), tests and docs green, type label + review label, never an "@claude review" comment, I merge. `/workflow:answer-review` waits for the whole review to finish, then works it: blocking first, then nits, a reply on every comment, security notes left for me, repeat until nothing blocks. `/workflow:watch-prs` follows my open PRs: waits for each whole review, answers it, fixes red CI, resolves conflicts, never merges. `/workflow:add-skill` makes or changes a skill in this repo, in the right plugin, versioned and validated. `/workflow:update-agents-md` keeps instruction files in sync with a change. `/workflow:mirror-sibling-change` ports a fix to a sibling app or package that duplicates code. `/workflow:fix-test-imports` fixes tests failing on import resolution in Jest, Vitest or Pytest. |
| `i18n` | `/i18n:translation-check` runs a dependency-free script over every locale set in the repo (i18next folders, `<lang>.json` files, next-intl messages): missing / extra keys, placeholders and tags, empty values, text left in English, plural forms each language needs (`_few` / `_many` in uk, pl, cs), forbidden words per language from `.claude/translations.json`. `/i18n:translation-review` reads the texts language by language: meaning, terms, formality, grammar with counts, length, local units and quotes. |
| `planning` | `/planning:write-ticket` turns a bug or idea into a ticket with steps and acceptance criteria on the tracker page. `/planning:staging-retest-plan` keeps one retest plan up to date in place: adds merged PRs, refreshes changed sections, removes what passed and is Tested, and turns "done testing" into Tested marks. `/planning:release-pr` writes the staging → production PR: tickets, migrations, env vars, flags, risks, rollback. `/planning:artifact-cleanup` proposes old or superseded artifacts and leftovers and deletes only what you confirm. `/planning:delete-tested-designs` deletes design pages once every ticket they cover is Tested on staging, after rescuing open questions and unlinking them from the tracker. |
| `guard` | Hooks on every shell command: no push to `main` / `master` / `staging` / `production` / `prod`, branch names must be `<type>/<scope>-<short-description>` (existing remote branches are exempt), no `--no-verify` or hook bypasses, no env files / keys / service-account JSON in a commit, confirm before a force push, a tracker reminder after a PR is opened or merged, and a check before finishing that edited code was tested. If a project has its own `.claude/hooks/claude-guard.js`, the plugin steps aside in that session. |

## Use it

**In every project on your machine:** once, in any Claude Code session:

```
/plugin marketplace add lec-lerka/claude-skills
/plugin install review@lec-lerka
/plugin install workflow@lec-lerka
/plugin install guard@lec-lerka
/plugin install i18n@lec-lerka
/plugin install planning@lec-lerka
```

**In one project for the whole team (and in cloud sessions):** add to that repo's
`.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "lec-lerka": { "source": { "source": "github", "repo": "lec-lerka/claude-skills" } }
  },
  "enabledPlugins": {
    "review@lec-lerka": true,
    "workflow@lec-lerka": true,
    "guard@lec-lerka": true,
    "i18n@lec-lerka": true,
    "planning@lec-lerka": true
  }
}
```

Install only what you need: each plugin costs a little context in every session, and `guard` enforces
your branch-naming rule, so leave it off in repos that name branches differently.

## Add a skill

Ask Claude to use `/workflow:add-skill`: it knows the layout, which plugin a skill belongs in, the version bump and the checks. In short: `plugins/<plugin>/skills/<skill>/SKILL.md`, bump the plugin's `version` in `plugin.json` and `marketplace.json`, run `claude plugin validate .`, open a PR into `main`, then `/plugin marketplace update lec-lerka`. Guard changes also run `node --test plugins/guard/hooks/claude-guard.test.js`.

## Project settings the skills read

Optional, committed in each project:

- `.claude/translations.json`: `ref`, `forbid` (per language), `allowSame`, `ignoreDirs` for `i18n:translation-check`.
- `.claude/planning.json`: `{"tracker": "<artifact url>", "retestPlan": "<artifact url>"}` so the planning skills don't have to search.
