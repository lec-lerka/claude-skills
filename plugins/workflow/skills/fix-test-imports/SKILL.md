---
name: fix-test-imports
description: Diagnose and fix a new test that fails on import resolution (ESM syntax error from node_modules, unresolved absolute or alias import, test file not collected) instead of on its assertions, in Jest, Vitest or Pytest. Use when a newly written test fails before any assertion runs.
---

# Fix the test tooling, not the test

A new test that fails before any assertion runs — an import or syntax error — is almost always a gap
in the runner's config, not a bug in the code under test. Rule this out before debugging the
implementation, and fix it once in config so the next test doesn't rediscover it.

## Steps

1. **Read the failure and match its shape:**
   - `SyntaxError: Unexpected token 'export'` / `Cannot use import statement outside a module` from
     inside `node_modules/<pkg>` → Jest is not transforming an ESM-only dependency.
   - `Cannot find module 'src/...'` / `'@/...'` → an absolute or alias import is not mapped for tests.
   - "no tests found" / the file is not collected → the runner's include pattern or test root.
   - Pytest `ModuleNotFoundError` for the app's own package, or `async def` tests skipped.
2. **Jest, ESM dependency** (CRA or plain Jest): add the package to the negative look-ahead in
   `transformIgnorePatterns` (in `package.json` `jest` or `jest.config.*`). Keep whatever is already
   in the list:
   ```json
   "transformIgnorePatterns": ["node_modules/(?!(<existing>|<new-pkg>)/)"]
   ```
3. **Jest, unmapped import:** mirror the `tsconfig`/`jsconfig` `paths` or `baseUrl` in
   `moduleNameMapper`, e.g. `"^src/(.*)$": "<rootDir>/$1"` or `"^@/(.*)$": "<rootDir>/src/$1"`.
   Don't rewrite the test to relative imports to dodge it.
4. **Vitest:** make sure aliases resolve in tests — `resolve.alias` matching `tsconfig` paths, or the
   `vite-tsconfig-paths` plugin / `resolve.tsconfigPaths` if the installed version has it — and that
   `test.include` covers the file and `test.environment` fits (`node` vs `jsdom`).
5. **Pytest:** `pytest.ini` / `pyproject.toml` `[tool.pytest.ini_options]` with `testpaths`, and
   `pythonpath = .` (or the package dir) for app imports; `asyncio_mode = auto` when pytest-asyncio is
   installed and tests are `async def`.
6. Before adding config, check the project's `AGENTS.md`: it may already document the fix or a
   different test command (some repos need a specific Node version or a wrapper script).

## Verify

- The test now fails or passes **on its assertions**, not on resolution.
- The fix is a config change of a line or two, and the rest of the suite still passes.
