# My Claude Code skills

A personal [Claude Code](https://claude.com/claude-code) plugin marketplace: one repo, every skill,
usable in any project. Skills here read each project's own `AGENTS.md`, `CLAUDE.md` and rule files
instead of carrying one project's rules.

| Plugin | What you get |
| --- | --- |
| `review` | `/review:pr-review` reviews PRs against the project's rule files and its review history: Important / Nit findings, each verified against the code, posted inline with a count summary (`--dry-run` for chat only). `/review:resolve-pr-conflicts` resolves a PR's conflicts with full history, merging rather than rebasing someone else's branch, and re-applies the PR's intent to code that came from the base. |
| `workflow` | `/workflow:update-agents-md` keeps instruction files in sync with a change. `/workflow:mirror-sibling-change` ports a fix to a sibling app or package that duplicates code. `/workflow:fix-test-imports` fixes tests failing on import resolution in Jest, Vitest or Pytest. |
| `guard` | Hooks on every shell command: no push to `main` / `master` / `staging` / `production` / `prod`, branch names must be `<type>/<scope>-<short-description>` (existing remote branches are exempt), no `--no-verify` or hook bypasses, no env files / keys / service-account JSON in a commit, confirm before a force push, a tracker reminder after a PR is opened or merged, and a check before finishing that edited code was tested. If a project has its own `.claude/hooks/claude-guard.js`, the plugin steps aside in that session. |

## Use it

**In every project on your machine:** once, in any Claude Code session:

```
/plugin marketplace add lec-lerka/claude-skills
/plugin install review@lec-lerka
/plugin install workflow@lec-lerka
/plugin install guard@lec-lerka
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
    "guard@lec-lerka": true
  }
}
```

Install only what you need: each plugin costs a little context in every session, and `guard` enforces
your branch-naming rule, so leave it off in repos that name branches differently.

## Add a skill

1. New folder `plugins/<plugin>/skills/<skill-name>/SKILL.md` (frontmatter `name` + `description`;
   the description is what makes Claude pick it, so say when to use it).
2. A new plugin also needs `plugins/<plugin>/.claude-plugin/plugin.json` and an entry in
   `.claude-plugin/marketplace.json`.
3. Bump the plugin's `version` in both files and check with `claude plugin validate .`. Open a PR into
   `main`, and after it merges run `/plugin marketplace update lec-lerka`.
4. Guard changes: `node --test plugins/guard/hooks/claude-guard.test.js`.
