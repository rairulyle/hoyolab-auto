# Release Engineering: Tooling, CI, and Release Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `hoyolab-auto` fork the same disciplined commit/CI/release workflow the reference bot (`hoyolab-discord-bot`) has — Conventional-Commit + lint/format git hooks, a lint+test+build CI gate, versioned GHCR image publishing on tags, a hand-maintained changelog with automated version bump, and `/release` + `/release-dev` skills.

**Architecture:** Local hygiene is enforced by **husky** git hooks (`commit-msg` → commitlint, `pre-commit` → lint-staged running ESLint + Prettier). **Prettier** owns formatting, **ESLint** owns correctness (`eslint-config-prettier` disables the overlap). Versioning is driven by **`commit-and-tag-version`**, configured to bump `package.json` + the root `version` file and cut the tag while leaving the **hand-maintained** `CHANGELOG.md` untouched (`skip.changelog: true`) — the `/release` skill finalizes the changelog by hand, exactly like the reference bot. Two GitHub Actions workflows: `ci.yml` (lint/format/test/build-validate on every push+PR to `main`) and `docker-publish.yml` (multi-arch semver+`latest` on a `v*.*.*` tag; single-arch `dev` on `workflow_dispatch`). The old `docker-image.yaml` (push-on-`main` → `latest`) is removed.

**Tech Stack:** Node ≥ 24 CommonJS, npm (`package-lock.json`), ESLint 8 (`.eslintrc.json`, already present), Prettier 3, husky 9, lint-staged 17, commitlint 21, `commit-and-tag-version` 12, GitHub Actions, GHCR, `gh` CLI.

## Global Constraints

- **Base branch:** this work is based on `origin/main`, which **already has Part A** (the DB/command/config rewrite) merged — real `__tests__/` suites, `@seald-io/nedb`, `dotenv`, and the `test` script all exist. Part B is otherwise independent of Part A and adds only repo/CI/release tooling.
- **Runtime/build:** Node ≥ 24 (Part A raised the engines floor from 20 to 24; the `node --test` glob in the `test` script needs Node's glob support), CommonJS (`"type": "commonjs"`). CI pins **Node 24**. Package manager is **npm** — `npm ci` in CI, `npm install` locally; always commit the updated `package-lock.json` in the same task that changes dependencies.
- **Code style:** tabs for indentation, double quotes, semicolons, **no trailing comma** — matches the existing `.eslintrc.json` and Part A's constraints. Prettier config must encode this so it never fights ESLint.
- **Commits:** Conventional Commits (`<type>(<scope>): <subject>`), enforced by the commitlint `commit-msg` hook. **No `Co-Authored-By:` trailers, no AI attribution** anywhere (commits, PRs, issues, release notes). No commitizen / guided-commit prompt — commitlint is the enforcement backstop for hand-typed messages.
- **Branching:** all tooling work in this plan happens on the feature branch `chore/release-engineering` (already created in an isolated worktree off `origin/main`), never directly on `main`. The **only** sanctioned direct-to-`main` commits are the release flow's changelog (`docs:`) and version-bump (`chore(release):`) commits, made by the `/release` skill.
- **Three-way version sync (invariant the release flow must preserve):** `package.json` `version` = root `version` file (with a leading `v`) = top `CHANGELOG.md` entry = git tag `vX.Y.Z`. Current baseline: `version` file = `v1.0.0`; `package.json` has **no** `version` field yet (Task 3 adds `1.0.0`).
- **Changelog:** hand-maintained, Keep-a-Changelog style, with an `## [Unreleased]` section maintained as work lands. `commit-and-tag-version` is configured to **skip** changelog generation — the changelog is finalized by hand in `/release` (rename `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`). This is a deliberate reference-bot-parity choice; see Task 3.
- **Image publishing:** GHCR repo `ghcr.io/<GHCR_USERNAME>/hoyolab-auto`, authenticated with the **existing** secrets `GHCR_USERNAME` + `GHCR_TOKEN` (same as today's `docker-image.yaml`). Do not switch to `GITHUB_TOKEN`/`github.actor`.
- **CI gating philosophy:** the publish workflow does **not** re-run tests — the `/release` and `/release-dev` skills gate on `ci.yml` being green **before** they push a tag / dispatch a publish. This is the spec's design and differs intentionally from the reference bot (whose publish workflow re-runs tests).

## File Map

| File | Responsibility |
| --- | --- |
| `.prettierrc` (new) | Prettier config encoding tabs/double-quotes/semi/no-trailing-comma |
| `.prettierignore` (new) | Excludes non-source (node_modules, data, logs, lockfile, LICENSE, google-script, docs/superpowers) |
| `.eslintrc.json` (modify) | `root: true`, `extends` → array with `prettier`, `ignorePatterns` for google-script |
| `package.json` (modify) | Add `version`, dev deps, `format`/`format:check`/`release`/`prepare` scripts, `lint-staged` config |
| `package-lock.json` (modify) | Updated by each `npm install` |
| `commitlint.config.js` (new) | `extends: ['@commitlint/config-conventional']` |
| `.husky/pre-commit` (new) | `npx lint-staged` |
| `.husky/commit-msg` (new) | `npx --no-install commitlint --edit "$1"` |
| `CHANGELOG.md` (new) | Keep-a-Changelog, seeded with `[Unreleased]` + `[1.0.0]` |
| `.versionrc.json` (new) | `commit-and-tag-version` config: `bumpFiles` + `skip.changelog` |
| `scripts/version-updater.js` (new) | Custom updater keeping the `v` prefix in the `version` file |
| `.github/workflows/ci.yml` (new) | lint + format:check + test + docker build-validate |
| `.github/workflows/docker-publish.yml` (new) | tag → multi-arch semver+latest; dispatch → `dev` |
| `.github/workflows/docker-image.yaml` (delete) | Old push-on-`main` → `latest` publisher |
| `.claude/skills/release/SKILL.md` (new) | `/release` skill (Node-adapted) |
| `.claude/skills/release-dev/SKILL.md` (new) | `/release-dev` skill (green-CI `dev` image) |

---

### Task 1: Prettier + ESLint interop, config, scripts, one-time format

Introduces Prettier as the formatter, wires `eslint-config-prettier` so the two never conflict, makes `eslint .` pass cleanly, and reformats the tree once so CI's `format:check` can pass.

**Files:**

- Modify: `.eslintrc.json`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (dev deps + `format`/`format:check` scripts)
- Modify: `package-lock.json` (via `npm install`)
- Modify: (whole tree, by the one-time `prettier --write .`)

**Interfaces:**

- Produces: `npm run format` (`prettier --write .`) and `npm run format:check` (`prettier --check .`), both relied on by Task 4's CI and the `/release` preflight.

**Note on scope:** the one-time `prettier --write .` produces a large `style:` diff across the whole tree (Part A's code plus the vendored-style dirs `gots/`, `object/`, `singleton/`, etc.). This is intentional and accepted for this actively-diverging fork. `origin/main` already includes the merged `feat/reminder-notifications-bot` work, so this one format pass covers it.

- [ ] **Step 1: Confirm you are on the worktree branch (do NOT create or switch branches)**

This task runs inside an isolated git worktree already checked out on `chore/release-engineering`, based on `origin/main`. Confirm, and do not run `git checkout`:

```bash
git rev-parse --abbrev-ref HEAD    # Expected: chore/release-engineering
```

- [ ] **Step 2: Install Prettier and the ESLint-interop config**

```bash
npm install --save-dev prettier@^3 eslint-config-prettier@^10
```

- [ ] **Step 3: Edit `.eslintrc.json` — add `root`, chain `prettier`, ignore the standalone Google Apps Script**

Four changes to `.eslintrc.json`:

1. Add `"root": true` as the first key of the top-level object. Without it, ESLint's config cascade walks up parent directories; in the nested worktree it finds a second `.eslintrc.json` and a second `eslint-plugin-unicorn`, aborting with "couldn't determine the plugin 'unicorn' uniquely". `root: true` is also correct standalone hygiene for a project-root config.

2. Change the `extends` value from a string to an array with `prettier` **last** (last wins, turning off ESLint's formatting rules):

```json
    "extends": ["eslint:recommended", "prettier"],
```

3. Add a top-level `ignorePatterns` key excluding `services/google-script/`:

```json
    "ignorePatterns": ["services/google-script/**"],
```

4. Disable the three formatting rules that conflict with Prettier. **Why this is separate from step 2:** `eslint-config-prettier` (added via `extends`) only turns off conflicting rules that come from *other* extended configs — it **cannot** override rules set directly in this file's own `rules` block. This `.eslintrc.json` hard-sets many formatting rules in `rules`; most were chosen to agree with our Prettier config (tabs, double quotes, semi, no-trailing-comma), but three genuinely conflict once Prettier reflows code (e.g. Prettier breaks long arrow chains onto a new line, violating `implicit-arrow-linebreak: ["error","beside"]` → 48 errors). The authoritative list comes from the tool's own checker — `npx eslint-config-prettier .eslintrc.json` reports exactly `implicit-arrow-linebreak`, `new-parens`, `space-infix-ops`. Set all three to `"off"` in the `rules` block (Prettier owns them now):

```json
        "implicit-arrow-linebreak": "off",
        "new-parens": "off",
        "space-infix-ops": "off",
```

After this edit, re-running `npx eslint-config-prettier .eslintrc.json` must print `No rules that are unnecessary or conflict with Prettier were found.`

**Why the ignore:** `services/google-script/index.js` is a self-contained Google Apps Script (uses GAS runtime globals like `UrlFetchApp`, `PropertiesService`, `Utilities`) kept as an upstream-parity mirror — it is **not** part of the Node bot runtime and can never pass Node ESLint (it emits **16 `no-undef` errors**). It drives its own independent Discord webhook and is deliberately kept, so exclude it rather than fix or delete it. Without this, `eslint .` exits non-zero and both Step 9 below and the Task 4 `ci.yml` lint gate fail on day one.

- [ ] **Step 4: Create `.prettierrc`**

```json
{
	"useTabs": true,
	"tabWidth": 4,
	"semi": true,
	"singleQuote": false,
	"trailingComma": "none",
	"printWidth": 100,
	"arrowParens": "always",
	"endOfLine": "lf"
}
```

- [ ] **Step 5: Create `.prettierignore`**

```
node_modules
data
logs
package-lock.json
LICENSE
*.min.js
CHANGELOG.md
services/google-script
docs/superpowers
```

`services/google-script` is excluded from Prettier for the same reason it is excluded from ESLint in Step 3 — an external Google Apps Script mirror, not bot source. `docs/superpowers` (specs and plans) is excluded because those markdown files carry **copy-verbatim** code samples inside fenced blocks; Prettier's embedded-code formatting would reflow them (JSON indentation, arrow-chain wrapping) and corrupt the exact text later task briefs extract. Planning artifacts stay pristine.

- [ ] **Step 6: Add the format scripts to `package.json`**

In the `scripts` block, add these two keys (next to `lint`/`lint:fix`):

```json
		"format": "prettier --write .",
		"format:check": "prettier --check ."
```

- [ ] **Step 7: Verify the config is wired before formatting (expect failures)**

```bash
npm run format:check
```

Expected: exits **non-zero**, listing many files as "Code style issues found" — the tree isn't formatted yet. This confirms Prettier is installed and reading `.prettierrc`/`.prettierignore` (node_modules/data/logs must NOT appear in the list).

- [ ] **Step 8: Format the whole tree once**

```bash
npm run format
```

- [ ] **Step 9: Verify format:check and lint both pass**

```bash
npm run format:check   # Expected: "All matched files use Prettier code style!" (exit 0)
npm run lint           # Expected: exit 0
```

`npm run lint` exits 0 because Step 3 excludes the google-script error source (`ignorePatterns`), stops the worktree cascade (`root: true`), and disables the three Prettier-conflicting formatting rules (`implicit-arrow-linebreak`, `new-parens`, `space-infix-ops`). ESLint may still print a handful of pre-existing **warnings** (e.g. `no-unused-vars`, `unicorn/no-array-push-push` in `commands/mimo/index.js`, `hoyolab-modules/mimo.js`, `platforms/telegram.js`) — warnings do **not** affect the exit code, so lint stays green. Leave those warnings for a later targeted cleanup. Do not silence any **non-stylistic** error introduced by reformatting (rare) with `noqa`-style disables — instead run `npm run lint:fix`, re-run `npm run format`, and re-verify both.

- [ ] **Step 10: Commit**

```bash
git add .eslintrc.json .prettierrc .prettierignore package.json package-lock.json
git commit -m "build: add prettier and eslint-config-prettier"
git add -A
git commit -m "style: format repository with prettier"
```

Two commits deliberately: config/deps (`build:`) separate from the mechanical reformat (`style:`) so review of each is trivial.

---

### Task 2: husky + lint-staged + commitlint

Wires local git hooks: `commit-msg` rejects non-Conventional messages, `pre-commit` runs ESLint + Prettier on staged files only.

**Files:**

- Modify: `package.json` (dev deps, `prepare` script, `lint-staged` config)
- Modify: `package-lock.json` (via `npm install`)
- Create: `commitlint.config.js`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`

**Interfaces:**

- Consumes: `format`/`lint` from Task 1.
- Produces: enforced local Conventional-Commit validation (the CI lint gate's local counterpart).

- [ ] **Step 1: Install the hook toolchain**

```bash
npm install --save-dev husky@^9 lint-staged@^17 @commitlint/cli@^21 @commitlint/config-conventional@^21
```

- [ ] **Step 2: Initialize husky**

```bash
npx husky init
```

This creates `.husky/pre-commit` (with a default `npm test` line), adds `"prepare": "husky"` to `package.json` scripts, and sets `core.hooksPath` to `.husky/_`.

- [ ] **Step 3: Overwrite `.husky/pre-commit` to run lint-staged**

Replace the file's entire contents with:

```sh
npx lint-staged
```

- [ ] **Step 4: Create `.husky/commit-msg`**

```sh
npx --no-install commitlint --edit "$1"
```

Make both hooks executable:

```bash
chmod +x .husky/pre-commit .husky/commit-msg
```

- [ ] **Step 5: Create `commitlint.config.js`**

```js
module.exports = {
	extends: ["@commitlint/config-conventional"]
};
```

- [ ] **Step 6: Add the lint-staged config to `package.json`**

Add this top-level key to `package.json`:

```json
	"lint-staged": {
		"*.{js,cjs,mjs}": ["eslint --fix", "prettier --write"],
		"*.{json,md,yml,yaml}": ["prettier --write"]
	}
```

- [ ] **Step 7: Verify commitlint rejects a bad message and accepts a good one**

```bash
echo "adds a thing" | npx commitlint          # Expected: exit non-zero, "type may not be empty" / "subject may not be empty"
echo "feat: add a thing" | npx commitlint      # Expected: exit 0, no output
```

- [ ] **Step 8: Verify lint-staged is runnable**

```bash
npx lint-staged --help    # Expected: exit 0, prints usage — confirms the binary resolves
```

(The `pre-commit` hook is exercised for real by this task's commit in Step 9; it only lints _staged_ files, so it runs fast.)

- [ ] **Step 9: Commit (exercises both hooks)**

```bash
git add package.json package-lock.json commitlint.config.js .husky
git commit -m "build: add husky, lint-staged, and commitlint"
```

Expected: `pre-commit` runs lint-staged on the staged files (passes), `commit-msg` validates the message (passes). If the commit is rejected, the hooks are working — fix the reported issue rather than bypassing with `--no-verify`.

---

### Task 3: CHANGELOG, version field, and `commit-and-tag-version`

Establishes the version-bump machinery: a seeded `CHANGELOG.md`, a `version` field in `package.json`, and `commit-and-tag-version` configured to bump both version files and cut the tag while leaving the changelog to human hands.

**Files:**

- Create: `CHANGELOG.md`
- Create: `.versionrc.json`
- Create: `scripts/version-updater.js`
- Modify: `package.json` (add `version`, dev dep, `release` script)
- Modify: `package-lock.json` (via `npm install`)

**Interfaces:**

- Consumes: Conventional-Commit history (Task 2's enforcement guarantees it).
- Produces: `npm run release` (`commit-and-tag-version`), which bumps `package.json` `version` + the root `version` file (via `scripts/version-updater.js`), commits `chore(release): X.Y.Z`, and creates the annotated `vX.Y.Z` tag. Relied on by the `/release` skill (Task 6). Also the `[Unreleased]` changelog contract relied on by `/release`.

**Design note (reference-bot parity):** the spec mentions `commit-and-tag-version` "moving Unreleased → a versioned section." We instead keep the changelog fully hand-maintained and set `skip.changelog: true`, matching the reference bot's `update_changelog_on_bump = false`. The `/release` skill (Task 6) performs the `[Unreleased] → [X.Y.Z]` rename as an explicit `docs:` step. This keeps one mental model across both bots and keeps the human-written notes authoritative.

- [ ] **Step 1: Install `commit-and-tag-version`**

```bash
npm install --save-dev commit-and-tag-version@^12
```

- [ ] **Step 2: Add the `version` field and `release` script to `package.json`**

`package.json` currently has **no** `version` field. Add it so it matches the `version` file's `v1.0.0`. Place `"version": "1.0.0"` right after `"name"`:

```json
	"name": "hoyolab-auto",
	"version": "1.0.0",
```

Add the `release` script to `scripts`:

```json
		"release": "commit-and-tag-version"
```

- [ ] **Step 3: Create `scripts/version-updater.js`**

The root `version` file stores `v1.0.0` (leading `v`, non-semver, no trailing newline). `commit-and-tag-version`'s built-in updaters can't parse that, so a custom updater strips/re-adds the `v`:

```js
module.exports.readVersion = (contents) => contents.trim().replace(/^v/, "");
module.exports.writeVersion = (contents, version) => `v${version}`;
```

- [ ] **Step 4: Create `.versionrc.json`**

```json
{
	"bumpFiles": [
		{ "filename": "package.json", "type": "json" },
		{ "filename": "version", "updater": "scripts/version-updater.js" }
	],
	"skip": { "changelog": true },
	"tagPrefix": "v"
}
```

- [ ] **Step 5: Create `CHANGELOG.md`**

Seed it Keep-a-Changelog style with an empty `[Unreleased]` and a `[1.0.0]` baseline (the fork's current state):

```markdown
# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-07-07

### Added

- Baseline fork of [torikushiii/hoyolab-auto](https://github.com/torikushiii/hoyolab-auto)
  with the fork's release-engineering tooling (Conventional-Commit hooks, CI,
  versioned GHCR publishing, `/release` + `/release-dev` skills).
```

- [ ] **Step 6: Verify the bump machinery in dry-run (no writes, no commit, no tag)**

```bash
npx commit-and-tag-version --dry-run --release-as patch
```

Expected: prints a plan bumping `1.0.0` → `1.0.1` in both `package.json` and `version`, committing `chore(release): 1.0.1`, and tagging `v1.0.1`. It must show it will update **both** bump files and must **not** mention writing `CHANGELOG.md`. If it errors reading the `version` file, fix `scripts/version-updater.js`.

- [ ] **Step 7: Verify the custom updater round-trips the `v` prefix**

```bash
node -e "const u=require('./scripts/version-updater.js'); const c=require('fs').readFileSync('version','utf8'); console.log('read:', JSON.stringify(u.readVersion(c)), 'write:', JSON.stringify(u.writeVersion(c,'1.0.1')));"
```

Expected: `read: "1.0.0" write: "v1.0.1"`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md .versionrc.json scripts/version-updater.js
git commit -m "build: add changelog and commit-and-tag-version bump config"
```

---

### Task 4: CI workflow (`ci.yml`)

Adds the lint + format + test + Docker-build-validate gate on every push and PR to `main`.

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `npm run lint`, `npm run format:check` (Task 1), `npm test` (existing, from Part A), and the repo `Dockerfile`.
- Produces: the required `ci.yml` green check the `/release` and `/release-dev` skills gate on.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  lint-test:
    name: Lint, Format & Test
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Check formatting
        run: npm run format:check

      - name: Test
        run: npm test

  build:
    name: Build Image (validate)
    needs: lint-test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image (no push)
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          platforms: linux/amd64
          tags: hoyolab-auto:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Sanity-check the four job commands locally (they are what CI runs)**

```bash
npm ci                 # Expected: clean install, lockfile in sync (fails loudly if package-lock.json drifted)
npm run lint           # Expected: exit 0
npm run format:check   # Expected: exit 0
npm test               # Expected: exit 0 (Part A's node:test suites pass — 47 tests)
```

If `npm ci` complains the lockfile is out of sync, run `npm install`, commit the updated `package-lock.json`, and retry.

- [ ] **Step 3: Validate the workflow YAML**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/ci.yml
```

Expected: no output, exit 0. (If Docker is unavailable, fall back to a YAML syntax parse: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` — exit 0.) The real end-to-end validation is the workflow run when the branch is pushed (Step 5).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, format, test, and build-validate workflow"
```

- [ ] **Step 5: Push the branch and confirm CI runs green**

```bash
git push -u origin chore/release-engineering
gh run watch --exit-status    # Expected: ci.yml completes green
```

If CI is red, fix on the branch and re-push before moving on — the later skills depend on a green `ci.yml`.

---

### Task 5: Publish workflow (`docker-publish.yml`) and remove the old publisher

Replaces push-on-`main` publishing with tag-driven multi-arch semver+`latest` publishing plus a `workflow_dispatch` `dev` publish. Removes `docker-image.yaml` so `latest` only moves on a real release.

**Files:**

- Create: `.github/workflows/docker-publish.yml`
- Delete: `.github/workflows/docker-image.yaml`

**Interfaces:**

- Consumes: existing secrets `GHCR_USERNAME`, `GHCR_TOKEN`; the repo `Dockerfile`.
- Produces: the GHCR publish triggered by the `vX.Y.Z` tag (`/release`, Task 6) and by `workflow_dispatch` (`/release-dev`, Task 7). Publishes `ghcr.io/<GHCR_USERNAME>/hoyolab-auto`.

- [ ] **Step 1: Create `.github/workflows/docker-publish.yml`**

```yaml
name: Publish Image to GHCR

# Two triggers:
#   - a vX.Y.Z tag (pushed by /release) -> multi-arch semver + latest
#   - workflow_dispatch (used by /release-dev) -> single-arch dev tag
# CI is gated by the release skills BEFORE they fire this, so no test job here.
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
    inputs:
      tag:
        description: "Image tag to publish (dispatch only)"
        required: false
        default: dev

permissions:
  contents: read

jobs:
  publish:
    name: Build & Publish
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up QEMU (multi-arch)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ secrets.GHCR_USERNAME }}
          password: ${{ secrets.GHCR_TOKEN }}

      - name: Compute tags and platforms
        id: cfg
        run: |
          IMAGE="ghcr.io/${{ secrets.GHCR_USERNAME }}/hoyolab-auto"
          if [ "${{ github.event_name }}" = "push" ]; then
            VER="${GITHUB_REF_NAME#v}"
            echo "platforms=linux/amd64,linux/arm64" >> "$GITHUB_OUTPUT"
            {
              echo "tags<<EOF"
              echo "${IMAGE}:${VER}"
              echo "${IMAGE}:latest"
              echo "EOF"
            } >> "$GITHUB_OUTPUT"
          else
            echo "platforms=linux/amd64" >> "$GITHUB_OUTPUT"
            {
              echo "tags<<EOF"
              echo "${IMAGE}:${{ github.event.inputs.tag }}"
              echo "EOF"
            } >> "$GITHUB_OUTPUT"
          fi

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          platforms: ${{ steps.cfg.outputs.platforms }}
          tags: ${{ steps.cfg.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Delete the old push-on-`main` publisher**

```bash
git rm .github/workflows/docker-image.yaml
```

- [ ] **Step 3: Validate the new workflow YAML**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/docker-publish.yml
```

Expected: no output, exit 0. (Fallback if Docker unavailable: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/docker-publish.yml'))"`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/docker-publish.yml .github/workflows/docker-image.yaml
git commit -m "ci: publish versioned GHCR images on tag, dev on dispatch"
```

(The `git rm` from Step 2 is already staged; `git add` of the deleted path is a no-op but harmless. Removing the old publisher and adding the new one are one logical change → one commit.)

- [ ] **Step 5: Push and re-confirm CI is still green**

```bash
git push
gh run watch --exit-status
```

(The publish workflow itself is only exercised by a real tag / dispatch, which happens via the skills in Tasks 6–7. `actionlint` + the eventual `/release` run are its validation.)

---

### Task 6: `/release` skill

A repo skill mirroring the reference bot's `/release`, Node-adapted: finalize changelog → bump → push `main` → wait for CI green → push tag → GHCR image → GitHub release.

**Files:**

- Create: `.claude/skills/release/SKILL.md`

**Interfaces:**

- Consumes: `npm run release` (Task 3), `ci.yml` (Task 4), `docker-publish.yml` (Task 5), the `[Unreleased]` changelog contract (Task 3), `gh` CLI.

- [ ] **Step 1: Create `.claude/skills/release/SKILL.md`**

````markdown
---
name: release
description: Use when cutting a release / publishing a new version of hoyolab-auto — finalizing the changelog, bumping the version, tagging, pushing, and creating the GitHub release. Triggers - "cut a release", "release X.Y.Z", "publish a new version", "do the release", "ship it".
---

# Release hoyolab-auto

## Overview

Drives the project's SemVer + Conventional-Commits release: finalize the
changelog, bump the version, push `main`, wait for CI, push the tag (which
fires `docker-publish.yml` → multi-arch image to GHCR), create the GitHub
release.

**Four things must end up in sync:** `package.json` version = root `version`
file (with a leading `v`) = `CHANGELOG.md` top entry = git tag (`vX.Y.Z`).

Release commits (changelog `docs:` + `chore(release):`) go directly to `main`
— the one exception to the feature-branch rule.

## Preflight — STOP if any fails

```bash
git rev-parse --abbrev-ref HEAD          # must be: main
git status --porcelain                   # must be empty (clean tree)
git fetch && git status -sb              # must be up to date with origin/main
npm run lint                             # must be clean
npm run format:check                     # must be clean
npm test                                 # must pass
```

- `## [Unreleased]` in `CHANGELOG.md` must have real entries. **No unreleased
  entries → nothing to release. Stop and ask.**
- There must be at least one `feat:`/`fix:` commit since the last tag, or the
  bump has nothing to do.

## Steps

### 1. Determine the next version

```bash
npx commit-and-tag-version --dry-run
```

Prints the target version based on Conventional Commits since the last tag
(`fix:` → patch · `feat:` → minor · `feat!:`/`BREAKING CHANGE:` → major). To
override, use `--release-as X.Y.Z`. Note the target `X.Y.Z` — used everywhere
below.

### 2. Finalize the changelog

`CHANGELOG.md` is hand-maintained; the bump tool is configured to skip it.
Rename the top heading `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (today's
date via `date +%F`), then commit it as its own non-bumping commit:

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for vX.Y.Z"
```

`docs:` is deliberate — it doesn't change the version computed in step 1.

### 3. Bump the version

```bash
npx commit-and-tag-version            # or: --release-as X.Y.Z
```

Bumps `version` in `package.json` **and** the root `version` file (via
`scripts/version-updater.js`, keeping the `v` prefix), creates a
`chore(release): X.Y.Z` commit, and creates the annotated `vX.Y.Z` tag
locally. It does not push, and (per `.versionrc.json` `skip.changelog`) does
not touch `CHANGELOG.md`.

### 4. Push main, wait for CI, then push the tag

Push `main` first so `ci.yml` validates the release commits **before** the tag
fires the publish workflow:

```bash
git push origin main
gh run watch --exit-status   # wait for CI to go green; STOP if it fails
git push origin vX.Y.Z       # fires docker-publish.yml → GHCR image
```

### 5. Create the GitHub release

Use the new `[X.Y.Z]` section of `CHANGELOG.md` as the notes body:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog section content>"
```

### 6. Verify

```bash
git describe --tags                                   # vX.Y.Z
gh release view vX.Y.Z                                 # exists, notes match changelog
node -p "require('./package.json').version"           # X.Y.Z
cat version                                            # vX.Y.Z
gh run list --workflow=docker-publish.yml --limit 1   # publish run green
```

The published image lands at `ghcr.io/<GHCR_USERNAME>/hoyolab-auto:X.Y.Z`
(also `latest`).

Finally, start a fresh `## [Unreleased]` heading at the top of `CHANGELOG.md`
in a follow-up `docs:` commit so the next cycle has somewhere to accumulate.

## Rollback (before anyone pulled)

```bash
git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z   # if pushed
gh release delete vX.Y.Z                                  # if created
git reset --hard HEAD~2   # drops chore(release) + changelog commits (verify first!)
```
````

- [ ] **Step 2: Verify the skill's frontmatter parses and its commands reference real scripts**

```bash
head -4 .claude/skills/release/SKILL.md          # frontmatter present (name, description)
grep -q '"release"' package.json && echo "release script OK"
grep -q '"format:check"' package.json && echo "format:check script OK"
```

Expected: frontmatter shows, both `echo`s print. (This skill is dry-run-verified end-to-end when the first real release is cut; do not cut a release here.)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/release/SKILL.md
git commit -m "docs: add /release skill"
```

---

### Task 7: `/release-dev` skill

A second repo skill: a fast preview publish of a `dev`-tagged image after CI is green, with no version churn.

**Files:**

- Create: `.claude/skills/release-dev/SKILL.md`

**Interfaces:**

- Consumes: `ci.yml` (Task 4), `docker-publish.yml`'s `workflow_dispatch` trigger (Task 5), `gh` CLI.

- [ ] **Step 1: Create `.claude/skills/release-dev/SKILL.md`**

````markdown
---
name: release-dev
description: Use when publishing a dev-tagged preview image of hoyolab-auto (no version bump, no changelog, no tag, no GitHub release) after CI is green. Triggers - "publish a dev image", "release dev", "push a preview image", "dev build".
---

# Publish dev image — hoyolab-auto

## Overview

Publishes a `dev`-tagged image to GHCR from the current commit, once CI is
green. **No** version bump, changelog edit, tag, or GitHub release — purely a
preview build. For real releases use `/release`.

Result: `ghcr.io/<GHCR_USERNAME>/hoyolab-auto:dev`.

## Preflight — STOP if any fails

```bash
git status --porcelain    # must be empty — the dev image is built from the pushed commit
git fetch && git status -sb
```

The current commit must be pushed to its remote branch so CI has run against
it. (Any branch is fine; `dev` is a moving preview tag.)

## Steps

### 1. Ensure CI is green on the current commit

```bash
git push
gh run watch --exit-status   # wait for ci.yml green; STOP if it fails
```

### 2. Dispatch the publish workflow (dev)

```bash
gh workflow run docker-publish.yml -f tag=dev
```

### 3. Watch the publish run

```bash
gh run watch --exit-status   # wait for the publish run to finish green
```

### 4. Verify

```bash
gh run list --workflow=docker-publish.yml --limit 1   # latest run green
```

The image lands at `ghcr.io/<GHCR_USERNAME>/hoyolab-auto:dev`. It does not
move `latest` or any semver tag.
````

- [ ] **Step 2: Verify frontmatter and that the dispatch target matches the workflow filename**

```bash
head -4 .claude/skills/release-dev/SKILL.md
grep -q 'workflow_dispatch' .github/workflows/docker-publish.yml && echo "dispatch trigger present"
```

Expected: frontmatter shows; `dispatch trigger present` prints.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/release-dev/SKILL.md
git commit -m "docs: add /release-dev skill"
```

---

## Finalization

- [ ] **Push the branch and confirm CI is green**

```bash
git push
gh run watch --exit-status
```

- [ ] **Open the PR** (via the `create-pr` skill or `gh`), targeting `main`. Do not merge release-tooling and a real release in the same PR — the first actual release is cut with `/release` _after_ this tooling lands on `main`.

## Self-Review (completed against the spec)

- **Spec coverage:** Local tooling (ESLint+Prettier interop, scripts) → Task 1; husky+commitlint+lint-staged → Task 2; CHANGELOG + `.versionrc` + `commit-and-tag-version` + `version`-file sync → Task 3; `ci.yml` → Task 4; `docker-publish.yml` + removal of `docker-image.yaml` → Task 5; `/release` → Task 6; `/release-dev` → Task 7. All spec Goals and the 5-step Rollout are covered. Non-goals (npm publish, runtime changes) are respected.
- **Deviations flagged:** (1) commitizen is dropped per user decision — commitlint alone enforces Conventional Commits. (2) The spec's "commit-and-tag-version moves Unreleased → versioned section" is implemented as reference-bot parity instead — `skip.changelog: true` + a hand `docs:` rename in `/release` (Task 3 design note). (3) `package.json` had no `version` field; Task 3 adds it. (4) The `version` file's `v` prefix needs a custom updater (Task 3 Step 3). (5) Node floor is **24** (Part A raised it), so CI pins Node 24. (6) `services/google-script/` is excluded from ESLint/Prettier (legacy GAS mirror), and `root: true` is added to fix the nested-worktree config cascade (Task 1 Step 3).
- **Type/name consistency:** script names `format`/`format:check`/`release`/`prepare` are defined in Tasks 1–3 and consumed identically in Tasks 4, 6. `scripts/version-updater.js` exports `readVersion`/`writeVersion` (Task 3) referenced by `.versionrc.json` (same task). Workflow filename `docker-publish.yml` is consistent across Tasks 5–7. Image path `ghcr.io/<GHCR_USERNAME>/hoyolab-auto` and secrets `GHCR_USERNAME`/`GHCR_TOKEN` are consistent across Task 5 and both skills.
- **Placeholder scan:** no TBD/TODO/"add error handling"-style placeholders; every config file and workflow is given in full.
