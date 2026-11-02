---
name: translation-review
description: Review the quality of translations language by language, as a native editor would: meaning matches the reference, natural phrasing, consistent terms, the right formality, correct grammar for counts and gender, UI length, local number/date/unit conventions, and the project's wording rules. Use after translation-check passes on new or changed texts, when reviewing a PR that adds texts, or when asked to check translations in every language.
---

# Translation review, one language at a time

`translation-check` proves every key exists with the right placeholders. This skill reads the words.

## 1. Scope and context

- Which texts: the keys a change added or edited (diff the locale files against the base branch), or a
  whole namespace or file if asked. Get the reference value and every language's value side by side.
- Where they appear: find each key's use in the code (`git grep "<key>"`). Is it a button, a title, an
  email, an error, a tooltip? How much space does it have? Is it in a sentence with other keys, or does
  it take a `{{count}}`, a name, a date?
- Project rules: `AGENTS.md` and `.claude/translations.json`, for words to avoid, product and plan
  names that stay untranslated, formality, and who the reader is (customer, dealer, admin).
- Existing glossary: how the same terms are already translated elsewhere in that language's files.
  `git grep` a term in that locale folder. Consistency beats your own preference.

## 2. Review each language separately

For every language, check each text for:

1. **Meaning**: says the same as the reference. Nothing added, nothing dropped, no false friends.
   Placeholders are used in the right grammatical role.
2. **Natural**: reads like that language's own product copy, not word-for-word English. Watch word
   order, articles and capitalisation (German nouns capitalised; no English Title Case in other
   languages).
3. **Terms**: the same thing has the same name everywhere (report, order, credit, VIN, plan names), and
   matches the glossary from step 1.
4. **Formality**: one register across the product, e.g. *Sie* or *du* in German, *ви* in Ukrainian,
   *vous* in French, *Vy* in Czech, *Pan/Pani* or the neutral forms in Polish. Don't mix them.
5. **Grammar with variables**: plural forms correct for real counts (1, 2, 5, 21, 22, 25 in uk, pl and
   cs); case after prepositions; gender agreement where a placeholder is a noun.
6. **Length**: buttons, tabs and badges stay roughly as short as the reference. Flag anything about
   40% longer in a tight spot.
7. **Local conventions**: units (км, кВт, к.с. in uk/bg), decimal comma, date order, currency position,
   quotes („…“ in de, « … » in fr, «…» in uk).
8. **Project rules**: forbidden words, brand spelling, plan names.

## 3. Report

Group by language, and give each finding the key, the current text, the problem and a suggested
text:

```
uk — 2 findings
- reportPage:upgrade.cta — "Оновити до Complete звіту" — word order reads as English; Complete is a plan name → "Перейти на звіт Complete"
- ...
de — no findings
```

- Say which languages you can judge confidently. For any you can't, say so rather than guessing, and
  suggest a native check.
- If asked to fix: apply the suggestions in the locale files, run `i18n:translation-check` again, and
  commit them with the change.
- In a PR review, post these as Nits, unless the meaning is wrong or a forbidden word appears: then
  it's Important.
