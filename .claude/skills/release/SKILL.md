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

For the **first** release there is no prior tag, so the tool analyzes the
entire history and may compute a surprising bump — pass `--release-as X.Y.Z`
explicitly (e.g. `--release-as 1.0.1`) to pin it.

### 2. Finalize the changelog

`CHANGELOG.md` is hand-maintained (and `.prettierignore`d, so Prettier never
reformats it — its layout is entirely on you). Rename the top heading
`## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (today's date via `date +%F`),
then commit it as its own non-bumping commit:

**Write every paragraph and bullet on a single line (no hard-wrapping).** GitHub
renders release-note markdown with single newlines as hard breaks, so a
hard-wrapped section pasted into a release comes out ragged with white space on
the right. One line per entry lets it reflow to full width.

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
