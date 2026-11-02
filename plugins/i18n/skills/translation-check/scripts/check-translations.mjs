#!/usr/bin/env node
// Compares every locale against the reference locale: missing / extra keys, placeholders that differ,
// empty values, values left in the reference language, missing plural forms, and forbidden words.
// No dependencies. Usage:
//   node check-translations.mjs [--root <dir>] [--ref en] [--config <file>] [--only <path-substring>]
//                               [--keys <key-substring>,...] [--json]
// Exit code 1 when an error-level problem is found, 0 otherwise.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};
const root = path.resolve(opt("root", process.cwd()));
const configPath = opt("config", path.join(root, ".claude", "translations.json"));
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const ref = opt("ref", config.ref || "en");
const only = opt("only", null);
const keyFilter = (opt("keys", "") || "").split(",").filter(Boolean);
const asJson = args.includes("--json");
// forbid: ["dealer"] for every language, or { "en": ["dealer"], "de": ["Händler"] }
const forbid = config.forbid || [];
// allowSame: keys (dotted, may end in *) or exact values allowed to equal the reference (brand names, units, codes)
const allowSame = config.allowSame || [];
const ignoreDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "out", ".turbo", ...(config.ignoreDirs || [])]);

const LANG = /^[a-z]{2,3}([-_][A-Za-z]{2,4})?$/;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function walk(dir, found) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  const langDirs = entries.filter((e) => e.isDirectory() && LANG.test(e.name) &&
    fs.readdirSync(path.join(dir, e.name)).some((f) => f.endsWith(".json")));
  const langFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".json") && LANG.test(e.name.slice(0, -5)));
  // folders such as `api` or `ui` look like language codes: a set needs the reference language among them
  const isDirSet = langDirs.length >= 2 && langDirs.some((e) => e.name === ref);
  if (isDirSet) {
    found.push({ dir, kind: "dirs", langs: langDirs.map((e) => e.name) });
  } else if (langFiles.length >= 2 && langFiles.some((e) => e.name === `${ref}.json`)) {
    found.push({ dir, kind: "files", langs: langFiles.map((e) => e.name.slice(0, -5)) });
  }
  for (const e of entries) {
    if (e.isDirectory() && !ignoreDirs.has(e.name) && !e.name.startsWith(".") && !(isDirSet && langDirs.includes(e))) walk(path.join(dir, e.name), found);
  }
}

function flatten(obj, prefix = "", out = {}) {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = obj;
  return out;
}
function readJson(file, problems) {
  try { return flatten(JSON.parse(fs.readFileSync(file, "utf8"))); } catch (e) {
    problems.push({ level: "error", type: "invalid-json", file, message: e.message });
    return null;
  }
}

// {{x}} (i18next), {x} / {x, plural, ...} (ICU, top level only), %s %d %1$s, $t(...) nesting, <tag> and <1>
function placeholders(value) {
  if (typeof value !== "string") return [];
  const found = [];
  for (const m of value.matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)) found.push(`{{${m[1]}}}`);
  const noDouble = value.replace(/\{\{[^}]*\}\}/g, "");
  let depth = 0, start = -1;
  for (let i = 0; i < noDouble.length; i++) {
    if (noDouble[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (noDouble[i] === "}" && depth > 0) {
      depth--;
      if (depth === 0) { const name = noDouble.slice(start + 1, i).split(",")[0].trim(); if (/^[\w.]+$/.test(name)) found.push(`{${name}}`); }
    }
  }
  for (const m of value.matchAll(/%(\d+\$)?[sdif@]/g)) found.push(m[0]);
  for (const m of value.matchAll(/\$t\(([^)]+)\)/g)) found.push(`$t(${m[1]})`);
  for (const m of value.matchAll(/<\/?([\w-]+)[^>]*>/g)) found.push(`<${m[1]}>`);
  return [...new Set(found)].sort();
}

const letters = (s) => String(s).replace(/\{\{[^}]*\}\}|\{[^}]*\}|<[^>]+>|https?:\/\/\S+|%\S/g, " ");
function looksUntranslated(value) {
  const words = letters(value).match(/\p{L}{3,}/gu) || [];
  return words.length > 0;
}
function allowedSame(key, value) {
  return allowSame.some((a) => a === value || a === key || (a.endsWith("*") && key.startsWith(a.slice(0, -1))));
}
function forbiddenFor(lang) {
  if (Array.isArray(forbid)) return forbid;
  return [...(forbid["*"] || []), ...(forbid[lang] || [])];
}
function pluralCategories(lang) {
  try { return new Intl.PluralRules(lang.replace("_", "-")).resolvedOptions().pluralCategories; } catch { return ["one", "other"]; }
}

const sets = [];
walk(root, sets);
const problems = [];
const summary = [];

for (const set of sets) {
  const rel = path.relative(root, set.dir) || ".";
  if (only && !rel.includes(only)) continue;
  const namespaces = set.kind === "dirs"
    ? [...new Set(set.langs.flatMap((l) => fs.readdirSync(path.join(set.dir, l)).filter((f) => f.endsWith(".json"))))]
    : [null];
  const fileOf = (lang, ns) => (ns ? path.join(set.dir, lang, ns) : path.join(set.dir, `${lang}.json`));
  summary.push({ set: rel, langs: set.langs.sort(), namespaces: namespaces.filter(Boolean).length || 1 });

  for (const ns of namespaces) {
    const refFile = fileOf(ref, ns);
    if (!fs.existsSync(refFile)) {
      problems.push({ level: "warn", type: "no-reference", file: path.relative(root, refFile), message: `exists in another language but not in ${ref}` });
      continue;
    }
    const refMap = readJson(refFile, problems);
    if (!refMap) continue;
    const refBases = new Set(Object.keys(refMap).map((k) => k.replace(PLURAL_SUFFIX, "")));
    const refPluralBases = new Set(Object.keys(refMap).filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, "")));
    const inScope = (k) => !keyFilter.length || keyFilter.some((f) => k.includes(f));

    for (const lang of set.langs) {
      if (lang === ref) continue;
      const file = fileOf(lang, ns);
      const relFile = path.relative(root, file);
      const add = (level, type, key, message) => problems.push({ level, type, file: relFile, lang, key, message });
      if (!fs.existsSync(file)) { add("error", "missing-file", null, `no ${ns || lang + ".json"} for ${lang}`); continue; }
      const map = readJson(file, problems);
      if (!map) continue;
      const bases = new Set(Object.keys(map).map((k) => k.replace(PLURAL_SUFFIX, "")));

      for (const base of refBases) if (inScope(base) && !bases.has(base)) add("error", "missing-key", base, `missing (${ref}: ${JSON.stringify(refMap[base] ?? refMap[`${base}_other`])})`);
      for (const base of bases) if (inScope(base) && !refBases.has(base)) add("warn", "extra-key", base, "not in the reference: unused or a leftover?");

      // the forms i18next picks at runtime for this language (Intl.PluralRules), e.g. uk/pl/cs need _few and _many
      const needed = pluralCategories(lang);
      for (const base of refPluralBases) {
        if (!inScope(base) || !bases.has(base)) continue;
        const missing = needed.filter((c) => map[`${base}_${c}`] === undefined && map[base] === undefined);
        // few / many in a language with both (uk, pl, cs, ru …) hit everyday counts like 3 or 5: an error.
        // A lone `many` (es, fr, it) is only used for numbers like 1,000,000: a warning.
        const everyday = (c) => c === "few" || (c === "many" && needed.includes("few")) || c === "one" || c === "other";
        const hard = missing.filter(everyday), soft = missing.filter((c) => !everyday(c));
        const list = (cs) => cs.map((c) => `_${c}`).join(", ");
        if (hard.length) add("error", "plural-forms", base, `missing plural form(s) ${list(hard)} needed in ${lang}`);
        if (soft.length) add("warn", "plural-forms", base, `missing ${list(soft)} (${lang} uses it only for large numbers like 1,000,000)`);
      }

      for (const [key, value] of Object.entries(map)) {
        if (!inScope(key)) continue;
        const refKey = refMap[key] !== undefined ? key : `${key.replace(PLURAL_SUFFIX, "")}_other`;
        const refValue = refMap[refKey] ?? refMap[key.replace(PLURAL_SUFFIX, "")];
        if (typeof value === "string" && value.trim() === "" && typeof refValue === "string" && refValue.trim() !== "") add("error", "empty", key, "empty value");
        if (refValue === undefined) continue;
        const a = placeholders(refValue).join(" "), b = placeholders(value).join(" ");
        if (a !== b) add("error", "placeholders", key, `placeholders differ: ${ref} [${a}] vs ${lang} [${b}]`);
        if (typeof value === "string" && value === refValue && looksUntranslated(value) && !allowedSame(key, value)) add("warn", "untranslated", key, `same as ${ref}: ${JSON.stringify(value)}`);
        for (const word of forbiddenFor(lang)) {
          if (typeof value === "string" && new RegExp(`(^|[^\\p{L}])${word}`, "iu").test(value)) add("error", "forbidden-word", key, `contains "${word}": ${JSON.stringify(value)}`);
        }
      }
    }
    for (const [key, value] of Object.entries(refMap)) {
      if (!inScope(key)) continue;
      for (const word of forbiddenFor(ref)) {
        if (typeof value === "string" && new RegExp(`(^|[^\\p{L}])${word}`, "iu").test(value)) problems.push({ level: "error", type: "forbidden-word", file: path.relative(root, refFile), lang: ref, key, message: `contains "${word}": ${JSON.stringify(value)}` });
      }
    }
  }
}

const errors = problems.filter((p) => p.level === "error").length;
if (asJson) {
  process.stdout.write(JSON.stringify({ root, ref, sets: summary, errors, warnings: problems.length - errors, problems }, null, 2) + "\n");
} else {
  if (!summary.length) console.log(`No locale sets with a "${ref}" reference found under ${root}.`);
  for (const s of summary) console.log(`set ${s.set}: ${s.langs.join(", ")} (${s.namespaces} file(s) per language)`);
  const byFile = {};
  for (const p of problems) (byFile[p.file] ||= []).push(p);
  for (const [file, list] of Object.entries(byFile).sort()) {
    console.log(`\n${file}`);
    for (const p of list) console.log(`  ${p.level === "error" ? "ERROR" : "warn "} ${p.type.padEnd(14)} ${p.key ?? ""}  ${p.message}`);
  }
  console.log(`\n${errors} error(s), ${problems.length - errors} warning(s).`);
}
process.exit(errors ? 1 : 0);
