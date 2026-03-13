# Design Document: npm Package Runtime Asset Integrity

## Overview

The fix has two parts:

1. Publish the root `scripts/` directory in the npm package.
2. Add a dedicated validation script that inspects `npm pack --json --dry-run` output and fails if runtime scripts are absent.

## Core Design

### Publish Surface

- Update `package.json` `files` allowlist to include `scripts/`
- Preserve the existing package model; do not move runtime scripts into a new directory in this patch

### Validation Script

- New script: `scripts/npm-package-runtime-asset-check.js`
- Responsibilities:
  - enumerate runtime script files from the repository `scripts/` directory
  - execute `npm pack --json --dry-run`
  - compare expected `scripts/*.js` files against the pack payload
  - emit JSON/reportable output and return non-zero when violations exist

### Release Gate Integration

- Add a package script, e.g. `gate:npm-runtime-assets`
- Wire it into `prepublishOnly` before publish

## Tradeoffs

### Why include `scripts/` instead of only copying one file

The observed crash starts with `git-managed-gate.js`, but multiple runtime paths call scripts directly from the installed package. Publishing only one file would create another partial, fragile release.

### Why keep scripts as scripts in this patch

A deeper refactor could move script logic into `lib/` and leave CLI wrappers in `scripts/`. That is a larger architectural change. This patch fixes release correctness first.

## Changed Files

- `package.json`
- `package-lock.json`
- `scripts/npm-package-runtime-asset-check.js`
- `tests/unit/scripts/npm-package-runtime-asset-check.test.js`

## Non-Goals

- No broad refactor of all `scripts/*.js` into `lib/`
- No retroactive mutation of already published npm tarballs
