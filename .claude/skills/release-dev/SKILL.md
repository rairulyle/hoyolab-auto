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
