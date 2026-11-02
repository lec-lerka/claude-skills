#!/usr/bin/env node
// Claude Code hooks: safety checks before shell commands, a tracker reminder after PRs,
// and a "did you verify?" check before Claude finishes. Mode = first CLI arg: pre | post | stop.
// Reads the hook payload (JSON) from stdin, prints a JSON decision on stdout, always exits 0.
// Registered in .claude/settings.json. A personal copy in ~/.claude/hooks steps aside only once
// the project copy has really run in this session: the project copy leaves a per-session marker
// in the temp dir, and the personal copy checks for it. Until then (e.g. the project hooks are not
// trusted yet) both run, which only repeats a check, never drops one.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROTECTED_BRANCHES = ["staging", "main", "master", "production", "prod"];
// Files that must never reach a commit: real customer PDFs, secrets, keys.
const FORBIDDEN = [
  { re: /(^|\/)test fles(\/|$)/i, why: "real sample PDFs (local only)" },
  { re: /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/i, why: "an env file with secrets" },
  { re: /\.(pem|key|p12|pfx)$/i, why: "a private key / certificate" },
  { re: /(^|\/)id_(rsa|ed25519|ecdsa)$/i, why: "an SSH private key" },
  { re: /(^|\/)service-account[^/]*\.json$/i, why: "a cloud service-account key" },
];
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/i;
// A test / lint / build command where a command starts (after any `VAR=x` prefixes), so the word in a commit
// message or a grep pattern doesn't count.
const VERIFY_CMD = /^[\s(]*(\w+=\S*\s+)*((yarn|npm|pnpm|npx)\s+(run\s+)?(test|lint|typecheck|build|tsc|jest|vitest)\b|(jest|vitest|pytest|tsc)\b|python3?\s+-m\s+pytest\b|node\s+--test\b)/i;

function out(obj) { if (obj) process.stdout.write(JSON.stringify(obj)); process.exit(0); }
function deny(reason) { out({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }); }
// An ask is held until every check has run, so a deny later in the command (e.g. a second push) still wins.
let pendingAsk = null;
function ask(reason) { pendingAsk = pendingAsk || reason; }
function flushAsk() {
  if (pendingAsk) out({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: pendingAsk } });
}
function git(cwd, args) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); } catch (e) { return ""; }
}
function forbiddenHits(paths) {
  const hits = [];
  for (const p of paths) {
    const norm = p.replace(/\\/g, "/").replace(/^['"]|['"]$/g, "");
    const f = FORBIDDEN.find((x) => x.re.test(norm));
    if (f) hits.push(`${norm} (${f.why})`);
  }
  return hits;
}

// A quoted single word is just that word to the shell: `git "push" origin main` and `git $'push'` run git push.
// Unquote such words up front so every check sees the command; quoted text with spaces (a message) stays quoted.
function unquoteWords(cmd) {
  // only plain words: unquoting `"a&b"` would turn its & into a separator
  return cmd.replace(/\$?'([\w./:@+=,%~^-]*)'|"([\w./:@+=,%~^-]*)"/g, (m, single, double) => single ?? double);
}
// Heredoc bodies are data (scripts, file contents), not commands.
function stripHeredocs(cmd) {
  return cmd.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2[ \t]*(?=\n|$)/g, "<<HEREDOC");
}
// Also drop quoted strings, so text like "… gh pr …" inside an argument isn't read as a command.
function codeOnly(cmd) {
  return stripHeredocs(cmd).replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");
}
// Like codeOnly, but keeps the quoted value of a git global `-C "<dir>"` or `-c "<key>=<value>"`, so those can
// be read while a `-C` or `-c` inside a quoted commit message is still blanked out.
function codeWithGlobalValues(cmd) {
  return stripHeredocs(cmd).replace(/(-[Cc]\s+)?('[^']*'|"(?:[^"\\]|\\.)*")/g, (m, c) => (c ? m : "''"));
}
// git's global options sit between `git` and the subcommand (`git -C dir push`); drop them so
// the checks below see `git push`, and run the branch/staged lookups in that segment's -C directory.
// Any `-x` / `--long[=v]` option there counts, not just a known list; the ones that take a
// separate value (`-C dir`, `-c k=v`, `--git-dir dir`, …) are matched first so the value goes too.
const GIT_GLOBALS = /\bgit((?:\s+(?:-[Cc]|--(?:git-dir|work-tree|namespace|config-env|super-prefix|attr-source))\s+(?:"[^"]*"|'[^']*'|\S+)|\s+--?[a-zA-Z][\w-]*(?:=\S+)?)+)(?=\s)/g;
function stripGitGlobals(s) { return s.replace(GIT_GLOBALS, "git"); }
// The command split on ; & && || | and newlines outside quotes, so each git subcommand is checked on its own
// and a separator inside a commit message doesn't cut it.
function segments(s) {
  const out = [""];
  for (const [tok] of s.matchAll(/"(?:[^"\\]|\\.)*"?|'[^']*'?|[;&|\n]|[^"';&|\n]+/g)) {
    if (/^[;&|\n]$/.test(tok)) out.push("");
    else out[out.length - 1] += tok;
  }
  return out;
}
// The cwd a segment's git command runs in: the hook's cwd, moved only by that segment's own -C.
// null when that -C directory doesn't exist.
function segmentCwd(seg, cwd) {
  let dir = null;
  for (const m of codeWithGlobalValues(seg).matchAll(GIT_GLOBALS)) {
    const dirs = [...m[1].matchAll(/-C\s+("[^"]*"|'[^']*'|\S+)/g)];
    if (dirs.length) dir = dirs[dirs.length - 1][1].replace(/^["']|["']$/g, "");
  }
  if (!dir) return cwd;
  const abs = path.resolve(cwd, dir);
  return fs.existsSync(abs) ? abs : null;
}
// A -C into a missing directory would make every lookup return "" and the check pass; refuse instead.
function needCwd(cwd, sub) {
  if (cwd === null) deny(`git -C points at a directory that does not exist, so the ${sub} check can't run. Fix the path first.`);
}

// Each check gets `code` (quoted strings blanked: use it to spot commands and flags), `cmd`
// (quotes kept: use it to read paths and refs) and the cwd its git subcommand runs in (null:
// a -C directory that doesn't exist). deny() exits; ask() is held until all checks ran.

// -n is commit's short form of --no-verify (for push it means --dry-run).
// --no-veri is the shortest abbreviation git accepts for --no-verify (--no-ver is ambiguous with --no-verbose). -n is --no-verify for git commit, alone or
// in a group of valueless flags (-n, -an, -in, -sn, -nm);
// -S takes an attached key id (-Snina@…), so it isn't one of them; a group led by a flag
// that takes a value (-uno, -mFixingLogin) is not it.
function checkNoVerify(code) {
  if (/\bgit\b[^;&|\n]*\s--no-veri[a-z]*\b/.test(code) || /\bgit\s+commit\b[^;&|\n]*\s-[aiqvsepo]*n/.test(code)) {
    deny("Skipping git hooks (--no-verify) is not allowed. Fix what the hook reports instead.");
  }
}

// Global options that skip or replace git hooks just as --no-verify does, read before the globals are stripped
// (quoted text other than a -c value is blanked, so a message that mentions them is fine): -c core.hooksPath /
// core.fsmonitor / a filter or diff driver command, or --exec-path. Their environment spellings count too.
const HOOK_KEYS = "core\\.hooksPath|core\\.fsmonitor|[\\w.-]+\\.(process|driver|command)|alias\\.[\\w.-]+";
const HOOK_BYPASS = new RegExp(`(^|\\s)(-c\\s+["']?(${HOOK_KEYS})=|--exec-path\\b)`, "i");
// `git config <hook key> <value>` makes the same bypass permanent for later commits
const HOOK_CONFIG = new RegExp(`\\bgit\\s+config\\b[^;&|\\n]*\\s(${HOOK_KEYS})(\\s|=|$)`, "i");
const HOOK_BYPASS_ENV = /(^|[\s;&|(])(GIT_CONFIG_(COUNT|KEY_\d+|PARAMETERS|GLOBAL|SYSTEM)=|HUSKY=0\b)/;
// --git-dir / --work-tree (or GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE) point git at another repository or index,
// which the staged-file lookups would not follow; refuse rather than check the wrong one.
const OTHER_REPO = /(^|\s)--(git-dir|work-tree)\b/;
const OTHER_REPO_ENV = /(^|[\s;&|(])GIT_(DIR|WORK_TREE|INDEX_FILE)=/;
// A cd / pushd / Set-Location earlier in the command moves where git runs, but not where these checks look.
const CHANGE_DIR = /(^|[\s;&|(])(cd|pushd|chdir|Set-Location|sl)(\s|$)/i;
function checkOtherRepo(full) {
  const code = codeOnly(full);
  // up to the last git add / commit / push, so a cd after an earlier, harmless one is seen too
  const stripped = stripGitGlobals(code);
  const gitAt = [...stripped.matchAll(/\bgit\s+(add|commit|push)\b/g)].reduce((at, m) => m.index, -1);
  if (gitAt < 0) return;
  if (CHANGE_DIR.test(stripped.slice(0, gitAt))) {
    deny("A cd before git add / commit / push would make the guard check the wrong repository. Use git -C <dir> instead.");
  }
  if (OTHER_REPO.test(globalsOnGit(code)) || envOnGit(full, OTHER_REPO_ENV)) {
    deny("git add / commit / push with --git-dir, --work-tree or GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE can't be checked. Use git -C <dir> instead.");
  }
}
// The global options of the git add / commit / push calls only, so one given to another git call (`git --git-dir=x log`)
// doesn't count.
function globalsOnGit(text) {
  return segments(text).filter((s) => /\bgit\s+(add|commit|push)\b/.test(stripGitGlobals(s)))
    .flatMap((s) => [...s.matchAll(GIT_GLOBALS)].map((m) => m[1])).join(" ");
}
// An env assignment applies to its own command (`VAR=x git commit`), or to everything after it when exported;
// only a git add / commit / push it applies to counts.
function envOnGit(full, env) {
  const segs = segments(codeOnly(full));
  const exported = (i) => segs.slice(0, i).some((s) => new RegExp(`\\bexport\\s[^;&|\\n]*${env.source.replace(/^\(\^\|\[[^\]]*\]\)/, "")}`).test(s));
  return segs.some((s, i) => /\bgit\s+(add|commit|push)\b/.test(stripGitGlobals(s)) && (env.test(s) || exported(i)));
}
function checkHookBypass(full) {
  const withValues = codeWithGlobalValues(full);
  // An alias defined with -c names its own subcommand, so it counts on any git call.
  const inlineAlias = [...withValues.matchAll(GIT_GLOBALS)].some((m) => /(^|\s)-c\s+["']?alias\./i.test(m[1]));
  const code = codeOnly(full);
  if (HOOK_BYPASS.test(globalsOnGit(withValues)) || inlineAlias || envOnGit(full, HOOK_BYPASS_ENV) || HOOK_CONFIG.test(stripGitGlobals(code))) {
    deny("Replacing git hooks with -c or git config core.hooksPath, a filter or fsmonitor command, --exec-path, GIT_CONFIG_* or HUSKY=0 is not allowed. Fix what the hook reports instead.");
  }
}
// A git add / commit / push handed to a shell can't be read here: the quoted argument of `bash|sh|zsh|dash -c`,
// `eval` or `pwsh|powershell -Command`, or a heredoc fed to one of those shells. Other quoted text (a commit
// message) doesn't count. A script file run by the shell stays out of sight; see AGENTS.md.
const SHELL_ARG = /(?:^|[\s;&|(])(?:(?:bash|sh|zsh|dash)(?:\.exe)?(?:\s+-\w+)*?\s+-\w*c|eval|iex|Invoke-Expression|(?:pwsh|powershell)(?:\.exe)?(?:\s+-\w+)*?\s+-c(?:ommand)?)\s+\$?('[^']*'|"(?:[^"\\]|\\.)*")/gi;
const SHELL_HEREDOC = /(?:^|[\s;&|(])(?:bash|sh|zsh|dash|pwsh|powershell)(?:\.exe)?\b[^\n]*<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2[ \t]*(?=\n|$)/gi;
function checkWrappedGit(full) {
  // and a $(…) or `…` inside double quotes, which the shell runs before the outer command
  const substituted = (stripHeredocs(full).match(/"(?:[^"\\]|\\.)*"/g) || []).filter((q) => /\$\(|`/.test(q));
  const wrapped = [...stripHeredocs(full).matchAll(SHELL_ARG)].map((m) => m[1]).concat(substituted)
    .concat([...full.matchAll(SHELL_HEREDOC)].map((m) => m[3]));
  if (wrapped.some((w) => /\bgit\s+(add|commit|push)\b/.test(stripGitGlobals(w)))) {
    deny("This runs git add / commit / push inside a shell command or heredoc, which the guard can't check. Run the git command directly.");
  }
}

// git add: block naming a forbidden path, or a bulk add / force add that would pick one up.
// The pathspecs git add was given: its non-option arguments (all of them after `--`).
function addPathspecs(addArgs) {
  const toks = addArgs.replace(/^[\s\S]*?\bgit\s+add\b/, "").match(/"[^"]*"|'[^']*'|\S+/g) || [];
  let dashes = false;
  const specs = [];
  for (const t of toks) {
    if (!dashes && t === "--") dashes = true;
    else if (dashes || !t.startsWith("-")) specs.push(t.replace(/^["']|["']$/g, ""));
  }
  return specs;
}
function checkGitAdd(code, cmd, cwd) {
  if (!/\bgit\s+add\b/.test(code)) return;
  // cmd is one segment (split outside quotes), so read to its end: a ; & | inside a quoted argument doesn't cut it
  const addArgs = (cmd.match(/\bgit\s+add\b[\s\S]*/) || [""])[0];
  const named = forbiddenHits(addPathspecs(addArgs));
  if (named.length) deny(`This git add names files that must never be committed: ${named.join(", ")}.`);
  // Any add is scanned, not only -A / . / -f: `git add api` stages the untracked .env.production inside it, and a
  // commit chained after it reads the index before the add has run.
  const specs = addPathspecs(addArgs);
  const flags = (code.match(/\bgit\s+add\b[\s\S]*/) || [""])[0];
  if (!specs.length && !/\s(-A|--all|-u|--update)\b/.test(flags)) return;
  needCwd(cwd, "git add");
  // -u / --update only stages tracked files, so untracked ones (`??`) can't be picked up, unless -A or -f widens it.
  const trackedOnly = /\s(-u|--update)\b/.test(flags) && !/\s(-A|--all|-f|--force)\b/.test(flags);
  const status = git(cwd, ["status", "--porcelain", "--untracked-files=all"]).split("\n")
    .filter((l) => l && !(trackedOnly && l.startsWith("??"))).map((l) => l.slice(3));
  const forced = /\s(-f|--force)\b/.test(flags)
    ? git(cwd, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"]).split("\n").filter(Boolean)
    : [];
  // only what the pathspecs cover; a glob or a $VAR is expanded later, so it counts as covering everything
  const covered = (e) => !specs.length || specs.some((sp) => /[*?[$]/.test(sp) || inPathspec(e, sp));
  const hits = forbiddenHits(status.concat(forced).filter(covered));
  if (hits.length) deny(`This git add would stage files that must never be committed: ${hits.slice(0, 5).join(", ")}. Add files by name instead.`);
}

// git commit options whose value is a separate argument, so that value isn't read as a pathspec.
const COMMIT_VALUE_OPTS = /^(-m|--message|-F|--file|-C|--reuse-message|-c|--reedit-message|--author|--date|--fixup|--squash|-t|--template|--trailer|--cleanup|--pathspec-from-file)$/;
// A short-flag group like -am or -mAddReadme. Letters before the first value-taking one are flags (`a` means --all);
// the rest is that option's value, attached (-mAddReadme) or, when the value letter is last, the next argument (-am).
function shortFlagGroup(letters, all) {
  const v = letters.search(/[mFCctS]/);
  const flags = v === -1 ? letters : letters.slice(0, v);
  return { all: all || flags.includes("a"), skipNext: v === letters.length - 1 };
}
// What `git commit` stages by itself: { all } for -a/--all, and the pathspecs it was given.
function commitStages(cmd) {
  const seg = (cmd.match(/\bgit\s+commit\b([\s\S]*)/) || ["", ""])[1];
  // a quote glued to an option (-m"…", --message="…") starts its own token
  const toks = [...seg.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s"']+)/g)].map((m) => ({ v: m[1] ?? m[2] ?? m[3], bare: m[3] !== undefined }));
  let all = false, skipNext = false, dashes = false;
  const paths = [];
  for (const t of toks) {
    if (skipNext) { skipNext = false; continue; }
    if (!dashes && t.bare && t.v === "--") { dashes = true; continue; }
    if (dashes || !t.bare || !t.v.startsWith("-")) { paths.push(t.v); continue; }
    if (t.v === "--all") all = true;
    if (/^-[a-zA-Z]+$/.test(t.v)) ({ all, skipNext } = shortFlagGroup(t.v.slice(1), all));
    // `--message=` with its quoted value in the next token
    else skipNext = COMMIT_VALUE_OPTS.test(t.v) || t.v.endsWith("=");
  }
  return { all, paths };
}
function inPathspec(entry, spec) {
  const p = spec.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  return p === "" || p === "." || entry === p || entry.startsWith(p + "/");
}

// git commit: the real gate — look at what is staged right now, plus what -a / <pathspec> stage at commit time.
function checkGitCommit(code, cmd, cwd) {
  if (!/\bgit\s+commit\b/.test(code)) return;
  needCwd(cwd, "git commit");
  const { all, paths } = commitStages(cmd);
  let atCommit = [];
  if (all || paths.length) {
    const tracked = git(cwd, ["status", "--porcelain"]).split("\n").filter((l) => l && !l.startsWith("??")).map((l) => l.slice(3));
    atCommit = (all ? tracked : tracked.filter((e) => paths.some((p) => inPathspec(e, p)))).concat(paths);
  }
  const hits = forbiddenHits(git(cwd, ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean).concat(atCommit));
  if (hits.length) {
    deny(`These files must never be committed: ${hits.join(", ")}. Unstage them with git restore --staged <file>, and leave them out of git commit -a / the pathspec.`);
  }
}

// A new branch follows AGENTS.md: <type>/<scope>-<short-description>, lowercase, no session ids.
const BRANCH_NAME = /^(fix|feat|chore|docs|test|revert|hotfix)\/[a-z0-9]+([.-][a-z0-9]+)+$/;
// The remote and the branch names a push writes: each refspec's destination, or the current branch when none is
// given. A delete, a tag or a glob names no new branch.
function pushedBranches(pushSeg, current) {
  // -d also counts bundled with other short flags (`-dv`), but not inside an -o value (`-odeploy`)
  if (/\s(--delete|-(?!o)[a-zA-Z]*d[a-zA-Z]*)(\s|$)/.test(pushSeg)) return { remote: null, names: [] };
  // --tags adds the tags to the push; a branch named with it is still checked, and only a tags-only push names none
  const tagsOnly = /\s--tags(\s|$)/.test(pushSeg);
  const toks = pushSeg.replace(/^[\s\S]*?\bgit\s+push\b/, "").match(/\S+/g) || [];
  const pos = [];
  for (let i = 0; i < toks.length; i++) {
    // a redirect (`2>&1`, `> log`, `>/dev/null`) is the shell's, not a refspec; a bare operator takes the next word
    if (/^\d*[<>]+&?$/.test(toks[i])) i++;
    else if (/^\d*[<>]/.test(toks[i])) continue;
    else if (/^(-o|--push-option|--repo|--receive-pack|--exec)$/.test(toks[i])) i++;
    else if (!toks[i].startsWith("-")) pos.push(toks[i]);
  }
  const refspecs = pos.length > 1 ? pos.slice(1) : tagsOnly ? [] : [current];
  const names = refspecs.map((r) => {
    const [src, dst] = r.replace(/^\+/, "").split(":");
    if (dst !== undefined && !src) return null;
    const name = ((dst === undefined ? src : dst).match(/^[\w./-]+/) || [""])[0].replace(/^refs\/heads\//, "");
    return name === "HEAD" ? current : name;
  });
  return { remote: pos[0] || null, names: names.filter((n) => n && n !== "HEAD" && !n.startsWith("refs/")) };
}

// git push: never straight to a protected branch, and force pushes need a human yes.
function checkGitPush(code, cmd, cwd) {
  if (!/\bgit\s+push\b/.test(code)) return;
  needCwd(cwd, "git push");
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  // From cmd with the quote characters dropped, so `"main"` or `"--force"` still count.
  const pushSeg = (cmd.match(/\bgit\s+push\b[\s\S]*/) || [""])[0].replace(/["']/g, "");
  // The name may come as `+staging` (force) or `refs/heads/staging`, on its own or after `src:`. It ends at any
  // character a ref name can't hold, so `main)` and `main>/dev/null` still count; `main:x` is the source side.
  const target = PROTECTED_BRANCHES.find((b) => new RegExp(`(\\s|:)\\+?(refs/heads/)?${b}(?![\\w./:-])`).test(pushSeg)) ||
    (PROTECTED_BRANCHES.includes(branch) && !/\s\S+:\S+/.test(pushSeg) ? branch : null);
  if (target) deny(`Pushing to the protected branch "${target}" is not allowed. Push a feature branch and open a PR.`);
  // --all / --mirror push every local branch, protected ones included.
  if (/\s--(all|mirror)\b/.test(pushSeg)) deny("git push --all / --mirror would push protected branches too. Push the feature branch by name.");
  // A branch already on the remote keeps its name; only a push that creates one is held to the naming rule.
  if (!/\$/.test(pushSeg)) {
    const typed = pushedBranches(pushSeg, branch);
    const names = typed.names;
    // no remote typed: the one git itself pushes to (branch pushRemote, remote.pushDefault, branch remote, origin)
    const setting = (key) => git(cwd, ["config", key]).trim();
    const remote = typed.remote || setting(`branch.${branch}.pushRemote`) || setting("remote.pushDefault") ||
      setting(`branch.${branch}.remote`) || "origin";
    const bad = names.find((n) => !PROTECTED_BRANCHES.includes(n) && !BRANCH_NAME.test(n) &&
      !git(cwd, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${n}`]).trim());
    if (bad) deny(`"${bad}" doesn't follow the branch naming rule: <type>/<scope>-<short-description>, lowercase, with type fix, feat, chore, docs, test, revert or hotfix, and no session ids. Rename it with git branch -m and push that.`);
  }
  // A shell variable (`$BRANCH`, `$(...)`, `$env:X`) can hold a protected name the check can't see.
  if (/\$/.test(pushSeg)) ask("The push target comes from a shell variable. Confirm it is not a protected branch.");
  if (/\s(--force(-with-lease|-if-includes)?(=\S*)?|-f)(\s|$)|\s\+\S/.test(pushSeg)) ask("Force push rewrites remote history. Confirm this is intended.");
}

// One spelling for every check: a line continuation (`\` or PowerShell's backtick before a newline) joins its two
// lines, `git.exe` is git, and a quoted single word is unquoted.
function normalize(command) {
  return unquoteWords(command.replace(/[\\`]\r?\n/g, " ").replace(/\bgit\.exe\b/gi, "git"));
}

// A git alias runs add / commit / push under another name (`p = push`), or a shell command (`!…`).
function checkGitAlias(segCode, cwd) {
  const sub = (segCode.match(/\bgit\s+([\w.-]+)/) || [])[1];
  if (!sub || /^(add|commit|push)$/.test(sub) || cwd === null) return;
  const expansion = git(cwd, ["config", "--get", `alias.${sub}`]).trim();
  if (/^(!|(\S+\s+)*?(add|commit|push)\b)/.test(expansion)) {
    deny(`git ${sub} is an alias for "${expansion}", which the guard can't check by name. Run the git command it stands for directly.`);
  }
}

function pre(input) {
  const full = normalize(String((input.tool_input && input.tool_input.command) || ""));
  const base = input.cwd || process.cwd();
  const cmd = stripGitGlobals(stripHeredocs(full));
  const code = stripGitGlobals(codeOnly(full));

  // Opt-in for machines where gh fails to authenticate from Git Bash but works from PowerShell.
  if (process.env.CLAUDE_GUARD_DENY_GH_IN_BASH === "1" && input.tool_name === "Bash" && /(^|[;&|(\n]\s*|\$\(\s*)gh\s+/.test(code)) {
    deny("gh does not authenticate from Bash on this machine. Run the same gh command with the PowerShell tool.");
  }
  checkNoVerify(code);
  checkHookBypass(full);
  checkOtherRepo(full);
  checkWrappedGit(full);
  // Every add, commit and push in a chained command is checked, each against its own segment and -C directory.
  for (const seg of segments(stripHeredocs(full))) {
    const segCode = stripGitGlobals(codeOnly(seg));
    const segCmd = stripGitGlobals(seg);
    const cwd = segmentCwd(seg, base);
    checkGitAlias(segCode, cwd);
    checkGitAdd(segCode, segCmd, cwd);
    checkGitCommit(segCode, segCmd, cwd);
    checkGitPush(segCode, segCmd, cwd);
  }
  flushAsk();
  out(null);
}

function post(input) {
  const cmd = String((input.tool_input && input.tool_input.command) || "");
  const code = codeOnly(cmd);
  if (!/\bgh\s+pr\s+(create|merge)\b/.test(code) || /\s(--help|-h|--dry-run)\b/.test(code)) out(null);
  // Read the subcommand outside quotes, so a title like "resolve merge conflict" isn't a merge.
  const what = /\bgh\s+pr\s+merge\b/.test(code) ? "merged" : "opened";
  // When the tool result is there, remind only for a PR that exists: create prints its URL,
  // a successful merge prints "merged pull request #N".
  const res = input.tool_response;
  let text = null;
  if (res != null) text = typeof res === "string" ? res : JSON.stringify(res);
  const num = text && (text.match(/\/pull\/(\d+)/) || (what === "merged" && text.match(/merged[^#\n]*#(\d+)/i)));
  if (text !== null && !num) out(null);
  const pr = num ? `PR #${num[1]}` : "A PR";
  out({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext:
    `${pr} was just ${what}. If the session has a task-tracker skill and the PR belongs to one of its tickets, use it: add the PR number to that ticket` +
    (what === "merged" ? " and set its status to Done (do NOT set Tested — only the user decides that)." : " and set it to In progress.") } });
}

// One transcript tool call → { edit: <repo-relative code file> } | { verify: true } | null.
function classifyToolUse(c, root) {
  if (!c || c.type !== "tool_use" || !c.input) return null;
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(c.name)) {
    const p = String(c.input.file_path || "").replace(/\\/g, "/");
    if (!root || !CODE_FILE.test(p) || !p.toLowerCase().startsWith(root + "/")) return null;
    const rel = p.slice(root.length + 1);
    // Skip Claude config (.claude/...), but not code in a worktree under .claude/worktrees/.
    const claudeConfig = /^\.claude\//i.test(rel) && !/^\.claude\/worktrees\//i.test(rel);
    return claudeConfig || /(^|\/)(test fles|scratchpad)\//i.test(rel) ? null : { edit: rel };
  }
  if ((c.name === "Bash" || c.name === "PowerShell") && segments(codeOnly(String(c.input.command || ""))).some((s) => VERIFY_CMD.test(s))) return { verify: true };
  return null;
}
function toolUses(line) {
  let rec; try { rec = JSON.parse(line); } catch (e) { return []; }
  return rec && rec.message && Array.isArray(rec.message.content) ? rec.message.content : [];
}

// Before Claude ends its turn: if code files were edited after the last test/lint/build run, ask once to verify.
function stop(input) {
  if (input.stop_hook_active) out(null);
  let lines;
  try { lines = fs.readFileSync(input.transcript_path, "utf8").split("\n"); } catch (e) { out(null); }
  let lastEdit = -1, lastVerify = -1;
  const edited = new Set();
  const root = (git(input.cwd || process.cwd(), ["rev-parse", "--show-toplevel"]).trim() || "").replace(/\\/g, "/").toLowerCase();
  lines.forEach((line, i) => {
    for (const k of (line ? toolUses(line) : []).map((c) => classifyToolUse(c, root)).filter(Boolean)) {
      if (k.edit) { lastEdit = i; edited.add(k.edit); } else lastVerify = i;
    }
  });
  if (lastEdit > lastVerify) {
    const files = [...edited].slice(0, 6).join(", ");
    out({ decision: "block", reason:
      `Code was changed after the last test/lint run (${files}). Before finishing, run the tests (and lint/typecheck if the sub-project has them) for the touched sub-project(s) and report the result. If running them is impossible or pointless here, say so explicitly in your reply instead.` });
  }
  out(null);
}

// The project copy's per-session marker, in a private dir the hook creates itself. null when
// that dir is a symlink, or (on POSIX) owned by someone else or open to other users.
function markerFile(sessionId) {
  const dir = path.join(os.tmpdir(), "claude-guard");
  let st;
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); st = fs.lstatSync(dir); } catch (e) { return null; }
  if (!st.isDirectory()) return null;
  if (process.getuid && (st.uid !== process.getuid() || (st.mode & 0o077) !== 0)) return null;
  return path.join(dir, `project-${String(sessionId).replace(/[^\w-]/g, "_")}`);
}
function isRegularFile(p) {
  try { return fs.lstatSync(p).isFile(); } catch (e) { return false; }
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw || "{}"); } catch (e) { out(null); }
  const mode = process.argv[2];
  const projectCopy = process.env.CLAUDE_PROJECT_DIR && path.join(process.env.CLAUDE_PROJECT_DIR, ".claude", "hooks", "claude-guard.js");
  const marker = projectCopy && input.session_id ? markerFile(input.session_id) : null;
  const isProjectCopy = !!projectCopy && path.resolve(projectCopy).toLowerCase() === path.resolve(__filename).toLowerCase();
  if (marker && isProjectCopy) {
    // "wx": never follow or truncate something already at that path. No marker: the personal copy keeps running.
    try { fs.writeFileSync(marker, "", { flag: "wx" }); } catch (e) { /* exists already, or unwritable */ }
  } else if (marker && !isProjectCopy && isRegularFile(marker)) out(null);
  try {
    if (mode === "pre") pre(input);
    else if (mode === "post") post(input);
    else if (mode === "stop") stop(input);
  } catch (e) { /* a broken check must never block work */ }
  out(null);
});
