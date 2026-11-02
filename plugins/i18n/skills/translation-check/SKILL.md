---
name: translation-check
description: Mechanically check every locale file against the reference language — missing or extra keys, placeholders and tags that differ, empty values, text left in English, missing plural forms (_few/_many for uk/pl/cs) and words the project forbids (e.g. "dealer" in customer texts). Use before delivering any change that adds or edits user-facing text, when reviewing such a PR, or when asked to audit translations.
---

# Translation check

The script finds every locale set in the repo by itself: i18next folders (`locales/<lang>/<namespace>.json`)
and per-language files (`translations/<lang>.json`, next-intl `messages/<lang>.json`). It needs no
install.

The script is `scripts/check-translations.mjs` in this skill's folder (the base directory shown when
the skill loads). Run it from the repo root:

```bash
node <skill folder>/scripts/check-translations.mjs --root .
```

Options: `--ref en` (the reference language), `--only <path part>` (one set, e.g. `user/ui`),
`--keys <key part>,…` (only those keys, e.g. the ones a PR touched), `--json`, and
`--config <file>`. The default config is `.claude/translations.json`.

## Project config (optional, commit it)

`.claude/translations.json`:

```json
{
  "ref": "en",
  "forbid": { "*": [], "en": ["dealer"], "de": ["Händler"], "uk": ["дилер"] },
  "allowSame": ["VIN", "PDF", "km", "brand.*", "example@company.com"],
  "ignoreDirs": ["fixtures"]
}
```

- `forbid`: words that must not appear, per language (`*` = all). Write the project's wording rules
  here (from its `AGENTS.md`), translated for each language.
- `allowSame`: keys (a trailing `*` matches a prefix) or exact values that may stay identical to the
  reference: brand names, units, codes, sample data.

## What to do with the result

1. **Scope it.** For a change or a PR, run with `--keys` for the keys the diff added or changed, or
   compare against the base branch's result, and report **only what the change introduced**. Anything
   that was already broken before the change gets one line, as its own ticket. Never a drive-by fix.
2. **Errors.** Fix them in the change itself, in every language:
   - `missing-key`, `empty`: add the key and translate it. Don't copy the English.
   - `placeholders`: same `{{vars}}`, `{vars}` and `<tags>` as the reference. Keep the names exactly; only
     their position in the sentence may move.
   - `plural-forms`: add each form the language needs (`_one`, `_few`, `_many`, `_other` for uk, pl and cs).
   - `forbidden-word`: reword, following the project's rule.
   - `invalid-json`: fix the syntax first, then run again.
3. **Warnings.** Judge each one:
   - `untranslated`: is it a brand, unit or code? Add it to `allowSame`. Otherwise translate it.
   - `extra-key`: is the key still read anywhere? `git grep` the key. Remove it from every language if
     nothing reads it, but only when that is in scope.
   - Plural `_many` in es, fr and it: these languages use it only for numbers like 1,000,000, so add it when the count can get that large.
4. Run the script again until the change adds no new errors. Then run `i18n:translation-review` on the
   new texts, for meaning and tone: this check cannot judge whether a translation is any good.

Report as: `N errors, M warnings in <sets>`, then each problem the change introduced, with its file,
key and fix.
