# Design Document: Scene Info

## Overview

Adds `sce scene info` command to display detailed information about a scene package in the local registry. Follows normalize → validate → run → print pattern. All code in `lib/commands/scene.js`.

## Components

### normalizeSceneInfoOptions
Defaults registry to `.sce/registry`, trims name, normalizes boolean flags.

### validateSceneInfoOptions
Requires `--name`.

### runSceneInfoCommand
1. Load registry index
2. Look up package by name
3. Build version list sorted by semver descending
4. Build payload with metadata and version details
5. Call printSceneInfoSummary

### printSceneInfoSummary
Human-readable: package name, group, description, latest, version table.
JSON: structured payload.
Versions-only: just the version list.

## Data Models

### Info Payload
```javascript
{
  success: true,
  name: "my-package",
  group: "sce.scene",
  description: "A scene package",
  latest: "2.0.0",
  versionCount: 3,
  versions: [
    { version: "2.0.0", publishedAt: "...", integrity: "sha256-..." },
    { version: "1.1.0", publishedAt: "...", integrity: "sha256-..." },
    { version: "1.0.0", publishedAt: "...", integrity: "sha256-..." }
  ]
}
```

## Correctness Properties

### Property 1: Version list completeness
*For any* registry index, the info command shall return exactly the versions present in the index for that package.

**Validates: Requirements 1.2, 1.3**

## Testing Strategy
- PBT library: `fast-check`, minimum 100 iterations
- All tests in `tests/unit/commands/scene.test.js`
