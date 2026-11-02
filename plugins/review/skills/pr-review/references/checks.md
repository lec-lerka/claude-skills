# What to check

Taken from the findings that reviews on our projects actually raised and authors fixed. The project's
own rule files come first; this list is what to look for inside them. Skip a section the diff has
nothing to do with.

## Correctness at the seams

- **Producer and consumer still agree.** A changed return shape, status value, enum, key or route
  that another file, another sub-project or a sibling app still reads the old way.
- **The other half exists.** A UI change that "mirrors" an API rule (or the reverse): is that half in
  the repo, on this branch? A fix in one app that the sibling app needs too.
- **Inventories and snapshots.** Specs that list every route, permission, locale key or setting
  (route-realm inventories, impersonation allow/deny lists, sitemap lists). A new entry must be added
  there deliberately — and adding it just to make CI green can hide a real decision.
- **Normalised once.** A value compared case-insensitively in one line but looked up raw in the next
  (`toUpperCase()` for the check, the raw value for the translation key).
- **Every branch reachable.** Values the real data sends (`small`/`medium`/`large`) that never match
  the keys the code expects (`Minor`/`Moderate`/`Major`), so they fall through to a default.

## Money, side effects, third parties  (`[safety]`)

- Paid calls (LLM, SMS, email, payment) behind a rate limit, a cache and a bound; no stampede on a
  cache miss (N concurrent requests → N paid calls).
- A route marked read-only / allowed during impersonation / public must really be side-effect free:
  follow the handler into every service it calls for writes and paid calls.
- Retries and redelivered jobs are no-ops the second time; claims and status moves use a conditional
  update so two workers can't take the same job.
- Kill switches and feature flags still gate the new path.

## Data exposure  (`[privacy]`)

- Secrets, tokens, customer PII, file names or raw payloads in logs, error messages, shared links,
  LLM prompts or analytics. Redaction must cover nested fields (arrays of photos inside objects), not
  just top-level keys.
- Access checked **before** the cache read or the paid call, and the cache key includes everything
  the answer depends on (owner, language, plan).

## Data and schema  (`[reversibility]`)

- Migrations generated and reversible; no hard delete on soft-delete tables; new entities in the
  folder the project says (watch entity globs that would register them on another connection).

## Boundaries  (`[contracts]`)

- Request bodies, webhook payloads, queue jobs and third-party/LLM responses validated before use.
- User-supplied values (language, sort, redirect URL) allow-listed before they reach storage or i18n.

## User-facing text

- Every new or changed text in **all** the project's languages (check each locale file, not just
  `en`), with the same keys and placeholders.
- No hard-coded words or units in components; ids stay in English for logic and styling, only the
  shown label is translated.
- Wording rules the project set (for example, customer texts never mention dealers).

## Tests

- The new behaviour has a test that would **fail if it regressed** — not one that passes either way
  because the fixture never reaches the branch or the whole module is mocked.
- No test deleted, skipped or weakened to get green (Important).
- Each test says in a one-line comment what behaviour it locks, if the project asks for that.
- A failing test that already fails on the base branch is not this PR's finding — say so.

## Scope, docs, delivery

- Only what the ticket asks; unrelated drive-by changes noted, not mixed in.
- `AGENTS.md` / README updated when a command, config, module layout or documented behaviour changed.
- CI / workflow changes: conditions (`if:`), triggers, bot actors, permissions and secrets narrowed,
  pinned versions.
- Branch, commit and label conventions from the project's rules.
