// Decision table for claude-guard.js: `pre` cases feed a Bash command to the hook, run in a throwaway repo, and check
// the allow / ask / deny decision; `post` and `stop` cases check the reminder and the verify-before-finishing block.
// Run: node --test plugins/guard/hooks/claude-guard.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOOK = path.join(__dirname, "claude-guard.js");

// a repo on a feature branch with a modified README, a tracked, modified .env.production and an untracked
// sub/server.pem. The older branch names below already exist on origin, so pushing them is not a new branch.
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-guard-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "feature");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "alias.p", "push");
  git("config", "alias.st", "status");
  git("config", "alias.x", "!git push origin main");
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "README"), "r\n");
  fs.writeFileSync(path.join(dir, ".env.production"), "x\n");
  git("add", "README", ".env.production");
  git("commit", "-qm", "init");
  for (const b of ["feature", "main-fix", "maintenance", "preview-123"]) git("update-ref", `refs/remotes/origin/${b}`, "HEAD");
  fs.appendFileSync(path.join(dir, "README"), "z\n");
  fs.appendFileSync(path.join(dir, ".env.production"), "y\n");
  fs.writeFileSync(path.join(dir, "sub", "server.pem"), "key\n");
  return dir;
}

const repo = makeRepo();

function runHook(mode, payload, cwd = repo) {
  const input = JSON.stringify({ cwd, session_id: "test", ...payload });
  const out = execFileSync("node", [HOOK, mode], { input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: "" } });
  return out ? JSON.parse(out) : null;
}
const decide = (command, cwd) => {
  const out = runHook("pre", { tool_name: "Bash", tool_input: { command } }, cwd);
  return out ? out.hookSpecificOutput.permissionDecision : "allow";
};

// [command, the behaviour the case locks]
const PRE = {
  allow: [
    ["git push origin feature", "a feature-branch push is fine"],
    ["git push origin main-fix maintenance", "a branch that only starts with a protected name is fine"],
    ["git push origin main:preview-123", "a protected name as the source of a refspec is fine"],
    ["git --git-dir=../other/.git log -1 && git push origin feature", "--git-dir on another git call doesn't count"],
    ['git -c core.hooksPath=/dev/null log -1 && git commit -m "docs: typo" README', "a hook override on another git call doesn't count"],
    ['git push origin "feature"', "a quoted feature branch is still a feature branch"],
    ["git commit -m wip README", "a commit naming only safe files"],
    ["git add README && git commit -m 'add readme'", "a chained add and commit of safe files"],
    ["git commit -mAddReadme README", "an attached -m value is a message, not flags (its `a` is not --all)"],
    ["git commit -uno -m fix README", "-uno is --untracked-files=no, not -n"],
    ["git commit -mFixingLogin README", "an attached message with an `n` is not -n"],
    ["git commit --no-verbose -m x README", "--no-verbose is not an abbreviation of --no-verify"],
    ['git commit -m"fix: load .env.local in dev" README', "a quote glued to -m starts the message; its words are not paths"],
    ['git commit --message="fix: rotate server.pem" README', "--message= takes the quoted value after it"],
    ["git commit -m 'wip; then git push origin main'", "separators and commands inside a quoted message don't count"],
    ['git commit -m "see git -c core.hooksPath=/tmp/x for context" README', "a message that mentions the hook bypass is not one"],
    ['git commit -m "cd into dir" README', "a message that mentions cd is not a cd"],
    ['git commit -m "chore: deps & lockfile" README', "a & inside the message doesn't cut the command"],
    ["git -c user.name=x commit -m x README", "a harmless -c setting"],
    ["git -C sub log --oneline && git push origin feature", "-C on another segment doesn't move the push check"],
    ['bash -c "echo hi" && git push origin feature', "a shell running something else, then a direct push"],
    ['bash scripts/release.sh && git commit -m "release: automate git push" README', "only the shell's own argument is read for wrapped git"],
    ["bash <<'EOF'\necho hello\nEOF", "a heredoc to a shell without git"],
    ["git commit -F - README <<'EOF'\nrelease: run git push later\nEOF", "a heredoc commit message is data"],
    ['git config user.name "Q A"', "git config of an unrelated key"],
    ['git commit -Snina@example.com -m "fix login" README', "-S takes an attached key id; its n is not -n"],
    ["cd sub && npm test", "a cd with no git add / commit / push after it"],
    ["git st", "an alias for a read-only command"],
    ['HUSKY=0 yarn test && git commit -m "docs: typo" README', "an env assignment on another command doesn't apply to the commit"],
    ['GIT_DIR=/tmp/x git log && git commit -m x README', "GIT_DIR on another command doesn't apply to the commit"],
    ['git commit -m "about test fles handling" README', "a message mentioning test fles is not a path"],
    ["git add README", "adding a safe file by name"],
    ["git add -u README", "-u with a pathspec stages only that tracked file"],
    ["git push -u origin fix/vin-rate-limit", "a new branch named <type>/<scope>-<description>"],
    ["git push origin HEAD:docs/agents-claude-md", "a new branch as the destination of a refspec"],
    ["git push origin feature", "an existing remote branch with an older name can still be pushed"],
    ["git push origin --delete claude/old-session-x1", "deleting a branch doesn't name a new one"],
    ["git push origin :claude/old-session-x1", "the refspec spelling of a delete"],
    ["git push -dv origin claude/old-session-x1", "a delete in a bundle of short flags"],
    ["git push origin --tags", "pushing tags names no branch"],
    ["git push -u origin fix/vin-rate-limit 2>&1 | tail -1", "a redirect after the push is not a branch name"],
    ["git push origin feature > push.log", "a redirect target is not a branch name"],
    ["git push --receive-pack git-receive-pack origin feature", "a value-taking option's value is not a branch name"],
  ],
  ask: [
    ["git push --force origin feature", "a force push asks"],
    ["git push origin feature; git push --force origin feature", "a force push in a later segment asks"],
    ["git push origin $BRANCH", "a push target from a shell variable asks"],
  ],
  deny: [
    ["git push origin main", "a push to a protected branch"],
    ["git push origin HEAD:main", "a protected name as the destination of a refspec"],
    ["git push \\\n  origin main", "a line continuation doesn't split the push"],
    ["git.exe push origin main", "git.exe is git"],
    ["git push origin refs/heads/staging", "a protected branch written as a full ref"],
    ["git push origin +production", "a protected branch with a force +"],
    ["git push --all origin", "--all pushes protected branches too"],
    ["git push origin feature && git push origin main", "every push in a chained command is checked"],
    ["git push origin feature --force && git push origin main", "a later deny beats an earlier ask"],
    ["(git push origin main)", "a subshell paren after the branch name still counts"],
    ["git push origin main>/dev/null", "a redirect glued to the branch name still counts"],
    ['git "push" origin main', "a quoted subcommand is still the subcommand"],
    ["git 'push' origin main", "a single-quoted subcommand too"],
    ['git push -o "a&b" origin main', "a & inside a quoted push option doesn't hide the branch"],
    ['git add ".env.production"', "naming a secret file in git add"],
    ["git add -A", "-A stages the untracked sub/server.pem"],
    ["git add .", "`.` stages everything, the key included"],
    ["git add -f .", "-f also stages ignored files"],
    ["git add -u", "-u stages the modified tracked .env.production"],
    ["git add sub", "a directory pathspec stages the key inside it"],
    ['git add sub && git commit -m "feat: x"', "the commit reads the index before the add runs, so the add is the gate"],
    ["git add '.env.production' && git commit -m wip", "a single-quoted secret path"],
    ["git commit -am wip", "-a commits the modified tracked .env.production"],
    ['git commit -m "chore: deps & lockfile" -a', "-a after a & in the message is still read"],
    ["git commit -m wip && git commit .env.production -m config", "the second commit's pathspec is checked"],
    ["git commit --no-verify -m x", "--no-verify skips hooks"],
    ["git commit --no-verif -m x", "an abbreviation of --no-verify"],
    ["git commit --no-veri -m x", "the shortest abbreviation git accepts for --no-verify"],
    ["git commit -n -m x", "-n is --no-verify for commit"],
    ["git commit -sn -m x", "-s (signoff) is valueless, so -sn is -n"],
    ["git commit -m x \\\n  --no-verify", "--no-verify on a continued line"],
    ["git commit \\\n  -am wip", "-a on a continued line"],
    ["git commit -in -m x README", "-i is valueless, so -in is --include --no-verify"],
    ["git -c core.hooksPath=/dev/null commit -m x", "-c core.hooksPath replaces the hooks"],
    ["git -c 'core.hooksPath=/dev/null' commit -m x", "a quoted -c value is still read"],
    ["git --exec-path=/tmp commit -m x", "--exec-path can replace git's own programs"],
    ["HUSKY=0 git commit -m x", "HUSKY=0 skips husky hooks"],
    ["export HUSKY=0; git commit -m x", "an exported HUSKY=0 applies to the later commit"],
    ["GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x", "the env spelling of -c"],
    ["git config core.hooksPath /tmp/empty", "git config makes the hook bypass permanent"],
    ["git p origin main", "an alias for push can't be checked by name"],
    ["git x", "an alias that runs a shell command can't be checked by name"],
    ["iex 'git push origin production'", "git inside PowerShell's iex can't be checked"],
    ['Invoke-Expression "git commit -m x"', "git inside Invoke-Expression can't be checked"],
    ["git -c alias.q=push q origin main", "an inline alias can't be checked by name"],
    ["git config alias.q push", "defining an alias for push"],
    ['git add "test fles"', "the sample-PDF directory without a trailing slash"],
    ["git add $DIR && git commit -m x", "a $VAR pathspec may cover the key, so the add is scanned in full"],
    ['echo "$(git push origin main)"', "git inside $(…) in double quotes runs and can't be checked"],
    ["git -C nowhere push origin feature", "-C into a missing directory can't be checked"],
    ["git --git-dir=../other/.git commit -m x", "--git-dir points at an index the check doesn't read"],
    ["GIT_DIR=../other/.git git commit -m x", "the env spelling of --git-dir"],
    ["cd ../other && git push", "a cd moves git but not the check"],
    ["git add README && cd ../other && git push", "a cd after an earlier git command is seen too"],
    ['bash -c "git push origin main"', "git inside bash -c can't be checked"],
    ['eval "git push origin main"', "git inside eval can't be checked"],
    ["bash <<'EOF'\ngit push --force origin main\nEOF", "git in a heredoc fed to a shell can't be checked"],
    ["git push -u origin claude/hopeful-keller-9dksoe", "a tool-generated session branch"],
    ["git push origin HEAD:claude/hopeful-keller-9dksoe", "a session branch as the refspec destination"],
    ["git push origin chore-node-update-2", "a new branch without the <type>/ prefix"],
    ["git push origin fix/vin", "a type and scope with no description"],
    ["git push origin Fix/Vin-Rate-Limit", "names are lowercase"],
    ["git push origin feature fix/x_y", "every branch in the push is checked, not only the first"],
    ["git push origin --tags claude/hopeful-keller-9dksoe", "a branch pushed together with --tags is still checked"],
    ["git push -odeploy origin claude/hopeful-keller-9dksoe", "a d inside an -o value is not a delete"],
  ],
};

for (const [expected, cases] of Object.entries(PRE)) {
  for (const [command, note] of cases) {
    test(`pre ${expected}: ${note} (${command.replace(/\n/g, " | ")})`, () => {
      assert.strictEqual(decide(command), expected);
    });
  }
}

// the remote that decides "already exists" is the one the push goes to: typed, or the branch's configured remote
test("pre allow: an existing branch on a remote not named origin keeps its name", () => {
  const dir = makeRepo();
  const run = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  run("checkout", "-q", "-b", "legacy-name");
  run("update-ref", "refs/remotes/upstream/legacy-name", "HEAD");
  run("config", "branch.legacy-name.remote", "upstream");
  assert.strictEqual(decide("git push upstream legacy-name", dir), "allow");
  assert.strictEqual(decide("git push", dir), "allow");
  assert.strictEqual(decide("git push origin legacy-name", dir), "deny");
});

// a bare push goes where git sends it: branch.<name>.pushRemote, then remote.pushDefault, before branch.<name>.remote
test("pre: a bare push checks the remote git pushes to, in git's order", () => {
  const dir = makeRepo();
  const run = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  run("checkout", "-q", "-b", "legacy-name");
  run("update-ref", "refs/remotes/upstream/legacy-name", "HEAD");
  run("config", "remote.pushDefault", "upstream");
  assert.strictEqual(decide("git push", dir), "allow");
  run("config", "branch.legacy-name.pushRemote", "origin");
  assert.strictEqual(decide("git push", dir), "deny");
});

// with no branch named, the push writes the current branch: a new badly named one is denied, however it is spelled
test("pre deny: a bare push from a new, badly named current branch", () => {
  const dir = makeRepo();
  execFileSync("git", ["checkout", "-q", "-b", "claude/bad-name-x1"], { cwd: dir });
  assert.strictEqual(decide("git push", dir), "deny");
  assert.strictEqual(decide("git push -u origin", dir), "deny");
  // a tags-only push from that branch names no branch, so it is not held to the rule
  assert.strictEqual(decide("git push origin --tags", dir), "allow");
});

const reminder = (command, stdout) => {
  const out = runHook("post", { tool_name: "Bash", tool_input: { command }, tool_response: { stdout } });
  return out ? out.hookSpecificOutput.additionalContext : null;
};

// a created PR gets the tracker reminder with its number
test("post: reminds after gh pr create, with the PR number", () => {
  assert.match(reminder("gh pr create --title x", "https://github.com/o/r/pull/42"), /PR #42 was just opened/);
});

// a quoted title mentioning merge doesn't turn a create into a merge
test("post: a title with 'merge' is still an opened PR", () => {
  assert.match(reminder('gh pr create --title "fix merge conflict"', "https://github.com/o/r/pull/7"), /PR #7 was just opened/);
});

// a merge gets the reminder to set the ticket Done, with the PR number from the merge output
test("post: reminds after gh pr merge, Done with the PR number", () => {
  const text = reminder("gh pr merge 42 --squash", "✓ Merged pull request #42 (title)");
  assert.match(text, /PR #42 was just merged/);
  assert.match(text, /Done/);
});

// a dry run creates nothing, so there is nothing to put in the tracker
test("post: no reminder for gh pr create --dry-run", () => {
  assert.strictEqual(reminder("gh pr create --dry-run", ""), null);
});

// a failed create prints no PR URL, so there is no PR to remind about
test("post: no reminder when the output shows no PR", () => {
  assert.strictEqual(reminder("gh pr create --title x", "error: no commits"), null);
});

function stopDecision(entries) {
  const transcript = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "claude-guard-t-")), "t.jsonl");
  const line = content => JSON.stringify({ message: { content: [content] } });
  fs.writeFileSync(transcript, entries.map(line).join("\n"));
  const out = runHook("stop", { transcript_path: transcript });
  return out ? out.decision : null;
}
const edit = file => ({ type: "tool_use", name: "Edit", input: { file_path: path.join(repo, file) } });
const bash = command => ({ type: "tool_use", name: "Bash", input: { command } });

// code edited after the last test run: finishing is blocked until tests run
test("stop: blocks when code changed after the last test run", () => {
  assert.strictEqual(stopDecision([bash("yarn test"), edit("sub/app.js")]), "block");
});

// a test run after the last edit lets Claude finish
test("stop: allows when tests ran after the last edit", () => {
  assert.strictEqual(stopDecision([edit("sub/app.js"), bash("yarn test")]), null);
});

// a test tool named in a commit message or a grep pattern is not a test run; a real one after `cd` or `VAR=x` is
test("stop: only a test command where a command starts counts as a test run", () => {
  assert.strictEqual(stopDecision([edit("sub/app.js"), bash('git commit -m "fix: resolve tsc errors"')]), "block");
  assert.strictEqual(stopDecision([edit("sub/app.js"), bash("git commit -m fix-tsc-errors")]), "block");
  assert.strictEqual(stopDecision([edit("sub/app.js"), bash('grep -rn "jest.config" src/')]), "block");
  assert.strictEqual(stopDecision([edit("sub/app.js"), bash("cd sub && CI=1 yarn test")]), null);
  assert.strictEqual(stopDecision([edit("sub/app.js"), bash("node --test sub/app.test.js")]), null);
});

// Claude config edits don't need a test run, but code in a worktree under .claude/worktrees/ does
test("stop: ignores .claude/ config but not .claude/worktrees/", () => {
  assert.strictEqual(stopDecision([edit(".claude/hooks/x.js")]), null);
  assert.strictEqual(stopDecision([edit(".claude/worktrees/w/src/app.js")]), "block");
});

// The repo's copy writes a per-session marker; a personal copy (~/.claude/hooks) then steps aside, so the
// checks don't run twice. Without the marker (project hooks not trusted yet) the personal copy keeps checking.
test("hand-off: a personal copy steps aside only after the project copy ran in this session", () => {
  // a throwaway project holding its own copy at .claude/hooks; this file (the plugin's copy) plays the personal one
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-guard-proj-"));
  const projectCopy = path.join(projectDir, ".claude", "hooks", "claude-guard.js");
  fs.mkdirSync(path.dirname(projectCopy), { recursive: true });
  fs.copyFileSync(HOOK, projectCopy);
  const personal = HOOK;
  const session = `handoff-${process.pid}-${Date.now()}`;
  const run = (hook, sessionId) => {
    const input = JSON.stringify({ cwd: repo, session_id: sessionId, tool_name: "Bash", tool_input: { command: "git push origin main" } });
    const out = execFileSync("node", [hook, "pre"], { input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } });
    return out ? JSON.parse(out).hookSpecificOutput.permissionDecision : "allow";
  };

  assert.strictEqual(run(personal, session), "deny");
  assert.strictEqual(run(projectCopy, session), "deny");
  assert.strictEqual(run(personal, session), "allow");
  assert.strictEqual(run(personal, `${session}-other`), "deny");
});
