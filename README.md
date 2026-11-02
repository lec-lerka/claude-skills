# My Claude Code skills

A personal [Claude Code](https://claude.com/claude-code) plugin marketplace: one repo, every skill,
usable in any project.

| Plugin | Skills |
| --- | --- |
| `review` | `/review:pr-review` — reviews PRs against the project's own rule files and its review history; Important / Nit findings, each verified, posted inline with a count summary. `--dry-run` reports in chat. |

## Use it

**In every project on your machine** — once, in any Claude Code session:

```
/plugin marketplace add lec-lerka/claude-skills
/plugin install review@lec-lerka
```

**In one project for the whole team (and in cloud sessions)** — add to that repo's
`.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "lec-lerka": { "source": { "source": "github", "repo": "lec-lerka/claude-skills" } }
  },
  "enabledPlugins": { "review@lec-lerka": true }
}
```

## Add a skill

1. New folder `plugins/<plugin>/skills/<skill-name>/SKILL.md` (frontmatter `name` + `description`;
   the description is what makes Claude pick it, so say when to use it).
2. A new plugin also needs `plugins/<plugin>/.claude-plugin/plugin.json` and an entry in
   `.claude-plugin/marketplace.json`.
3. Bump the plugin's `version` in both files, commit, push. Run `/plugin marketplace update lec-lerka`
   to pull it.

Keep skills project-agnostic: read the project's `AGENTS.md`, `CLAUDE.md` and rule files instead of
writing one project's rules into the skill.
