# Implementation Plan: Moqui Scene Template Extractor

## Overview

Implement the `moqui-extractor.js` module and `scene extract` CLI command. The module connects to Moqui via existing MoquiClient, discovers resources, identifies business patterns, and generates scene template bundles (YAML manifests + JSON package contracts). The CLI command follows the established normalize → validate → run → print pattern.

## Tasks

- [x] 1. Create moqui-extractor.js with YAML serializer and core utilities
  - [x] 1.1 Create `lib/scene-runtime/moqui-extractor.js` with constants (SUPPORTED_PATTERNS, HEADER_ITEM_SUFFIXES, SCENE_API_VERSION, PACKAGE_API_VERSION) and implement `serializeManifestToYaml` and `parseYaml` functions for the subset of YAML used by scene manifests (nested objects, arrays, string/number/boolean values, 2-space indentation)
    - Export all functions in module.exports
    - _Requirements: 3.6, 8.2_

  - [x]* 1.2 Write property test for YAML round-trip
    - **Property 6: YAML serialization round-trip**
    - Generate random scene manifest objects with nested objects, arrays, strings, numbers, booleans
    - Verify `parseYaml(serializeManifestToYaml(manifest))` produces equivalent object
    - **Validates: Requirements 3.6, 8.2**

  - [x] 1.3 Implement `groupRelatedEntities(entityNames)` that groups entities by header/item suffix patterns and `deriveBundleDirName(match)` and `derivePackageName(match)` utility functions
    - _Requirements: 2.4, 4.2, 5.2_

  - [x]* 1.4 Write property test for entity grouping
    - **Property 1: Entity grouping preserves all entities**
    - Generate random lists of entity names, some with Header/Item suffixes
    - Verify every entity appears in exactly one group, related entities are grouped together, total count preserved
    - **Validates: Requirements 2.4**

- [x] 2. Implement pattern matching and analysis
  - [x] 2.1 Implement `matchEntityPattern(group, services)` that classifies entity groups into "crud" or "query" patterns, and `matchWorkflowPatterns(services, entities)` for workflow pattern detection
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Implement `analyzeResources(discovery, options)` that orchestrates pattern matching across all discovered resources, applies `--pattern` filter, and handles the empty-match case
    - _Requirements: 2.2, 2.3, 2.5_

  - [x]* 2.3 Write property test for pattern classification
    - **Property 2: Pattern classification consistency**
    - Generate random entity/service lists, verify all matches have valid pattern types and non-empty entity subsets
    - **Validates: Requirements 2.2**

  - [x]* 2.4 Write property test for pattern filter
    - **Property 3: Pattern filter restricts output**
    - Generate random discovery payloads + filter values, verify filtered output is subset of unfiltered and all matches have correct pattern
    - **Validates: Requirements 2.3**

- [x] 3. Implement manifest and contract generation
  - [x] 3.1 Implement `generateSceneManifest(match)` that produces scene manifest objects with correct apiVersion, kind, bindings, model_scope, and governance_contract based on pattern type
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Implement `generatePackageContract(match)` that produces package contract objects with correct apiVersion, kind, metadata, parameters, artifacts, and governance
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 3.3 Write property test for manifest generation
    - **Property 4: Manifest generation correctness**
    - Generate random PatternMatch objects per pattern type, verify apiVersion, kind, binding counts, and governance fields
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

  - [x]* 3.4 Write property test for contract generation
    - **Property 5: Contract generation correctness**
    - Generate random PatternMatch objects, verify apiVersion, kind, metadata fields, kebab-case name, and parameters
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

  - [x]* 3.5 Write property test for JSON round-trip
    - **Property 7: ExtractionResult JSON round-trip**
    - Generate random ExtractionResult objects, verify JSON.parse(JSON.stringify(result)) equivalence
    - **Validates: Requirements 8.1, 8.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement file writing and extraction pipeline
  - [x] 5.1 Implement `writeTemplateBundles(bundles, outDir, fileSystem)` that creates subdirectories and writes scene.yaml + scene-package.json per bundle, with partial failure resilience
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 7.3_

  - [x] 5.2 Implement `discoverResources(client, options)` that queries Moqui catalog endpoints with type filtering and partial failure handling
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 5.3 Implement `runExtraction(options, dependencies)` that orchestrates the full pipeline: config loading → client creation → login → discover → analyze → generate → write (or dry-run) → dispose
    - _Requirements: 1.1, 1.3, 5.4, 7.1, 7.2, 7.4_

  - [x]* 5.4 Write property test for file writing structure
    - **Property 8: File writing structure**
    - Generate random bundle lists + output dirs with mock FS, verify directory structure and file names
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x]* 5.5 Write property test for dry-run
    - **Property 9: Dry-run produces no file writes**
    - Generate random options with dryRun=true, verify zero FS write operations
    - **Validates: Requirements 5.4**

  - [x]* 5.6 Write property test for partial failure resilience
    - **Property 10: Partial failure resilience**
    - Generate random bundles with injected write failures, verify remaining bundles written and warnings collected
    - **Validates: Requirements 1.4, 7.3**

- [x] 6. Implement CLI command integration
  - [x] 6.1 Add `normalizeSceneExtractOptions`, `validateSceneExtractOptions`, `printSceneExtractSummary` functions to `lib/commands/scene.js`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.2 Add `runSceneExtractCommand` function and register `scene extract` subcommand in `registerSceneCommands` with options: `--config`, `--type`, `--pattern`, `--out`, `--dry-run`, `--json`
    - Wire to `runExtraction` from moqui-extractor.js
    - Export all new functions in module.exports
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 7.4_

  - [x]* 6.3 Write property test for option validation
    - **Property 11: Option validation rejects invalid values**
    - Generate random invalid type/pattern strings, verify validateSceneExtractOptions returns non-null error
    - **Validates: Requirements 6.5, 6.6**

  - [x]* 6.4 Write unit tests for CLI command
    - Test normalize/validate with valid and invalid options
    - Test runSceneExtractCommand with mocked extractor (success and failure paths)
    - Test printSceneExtractSummary in JSON and human-readable modes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with minimum 100 iterations
- All functions must be exported in module.exports
- No new external dependencies — YAML serializer is built-in
- MoquiClient and MoquiAdapter are reused from Spec 90
