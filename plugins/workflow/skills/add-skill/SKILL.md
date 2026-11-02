---
name: add-skill
description: Create or change one of my Claude Code skills, in the right place — my skills repository lec-lerka/claude-skills, not the project being worked on. Use when asked to make, add, save or update a skill, a reusable workflow, a rule "for next time", or a hook, from any project.
---

# Add or change a skill

## Where it goes

**My skills live in one repository: `lec-lerka/claude-skills`** (a Claude Code plugin marketplace).
Not in the project you are working in, and not in `~/.claude/skills`.

- A rule or workflow I want everywhere → a skill in `lec-lerka/claude-skills`.
- A rule only true for one project (its paths, its commands) → that project's `AGENTS.md` /
  `CLAUDE.md`, or its `.claude/skills/`, and only when I ask for it there.
- If unsure, ask once: "for all your projects, or only this one?"

Never commit a personal skill into a work repository. If you started one there by mistake, remove that
commit or branch (ask before deleting a remote branch).

## Getting the repository into the session

- Cloud session: attach it with `add_repo` (owner `lec-lerka`, repo `claude-skills`, access `push`),
  then clone it next to the project (`/home/user/claude-skills`).
- If attaching is refused, say so plainly and give me the fix: install the Claude GitHub App on my
  personal account with access to `claude-skills` (https://claude.ai/connect-github), then try again.
  Meanwhile, prepare the change and hand it over as files or a patch. Don't leave it only in this
  container.

## Layout

```
.claude-plugin/marketplace.json        one entry per plugin: name, version, source, description
plugins/<plugin>/.claude-plugin/plugin.json
plugins/<plugin>/skills/<skill>/SKILL.md
plugins/<plugin>/skills/<skill>/references/*.md   optional, loaded on demand
plugins/<plugin>/skills/<skill>/scripts/*         optional, run by the skill
plugins/<plugin>/hooks/hooks.json                 optional, hooks with ${CLAUDE_PLUGIN_ROOT}
README.md                                         a table of every plugin and skill
```

Plugins and what belongs in each:

| Plugin | For |
|---|---|
| `review` | reviewing PRs, resolving conflicts |
| `workflow` | delivering work: PRs, answering reviews, watching PRs, docs sync, sibling apps, test tooling, adding skills |
| `planning` | tickets, retest plans, releases, artifact cleanup |
| `i18n` | translations |
| `guard` | safety hooks |

A skill that fits none of them: a new plugin, with its own `plugin.json` and marketplace entry.
Extend an existing skill rather than adding a near-duplicate one.

## Writing the skill

- Frontmatter: `name` (the folder name) and `description`: what it does **and when to use it**. Claude
  picks a skill by this description, so name the trigger phrases.
- Body: steps in order, the rules that always hold, and what to report. Short sentences.
- **Project-agnostic.** Read the project's `AGENTS.md`, `CLAUDE.md`, `.claude/engineering-rules.md` and
  `.claude/*.json` settings instead of writing one project's paths, branches or commands into the
  skill. A project-specific example is fine if it's marked as an example.
- No secrets, tokens, customer data or internal hostnames.
- Put scripts in `scripts/`, with no dependencies where possible, and test them on a real project
  before shipping.

## Shipping it

1. A branch named `feat/<plugin>-<short-description>` (or `fix/…`) from `main`. Never push to `main`:
   the guard hook blocks it.
2. Bump the plugin's `version` in **both** `plugin.json` and `marketplace.json`: minor for a new
   skill or rule, patch for a wording fix. Update the README table.
3. `claude plugin validate .` and `claude plugin validate plugins/<plugin>`. For guard changes, also
   `node --test plugins/guard/hooks/claude-guard.test.js`.
4. Commit authored by me and committed by Claude (`workflow:deliver-pr`), push, and open a PR into
   `main`. I merge, unless I ask you to.
5. Tell me to run `/plugin marketplace update lec-lerka` to get it in my other sessions.
