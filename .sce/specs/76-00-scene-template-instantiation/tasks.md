# Implementation Plan: Scene Template Instantiation

## Overview

Implement the `scene instantiate` command in `lib/commands/scene.js` following the existing normalize → validate → execute → print pattern. The command orchestrates the full pipeline: registry scanning → package resolution → inheritance merging → variable validation → template rendering → manifest/log generation → post-hook execution. All new functions are added to `lib/commands/scene.js` and exported. Tests go in `tests/unit/commands/scene.test.js`.

## Tasks

- [x] 1. Add CLI option normalization, validation, and registry builder
  - [x] 1.1 Implement `normalizeSceneInstantiateOptions(options)` and `validateSceneInstantiateOptions(options)`
    - Normalize: `package` (string), `values` (string), `out` (string), `templateDir` (string), `list` (boolean), `dryRun` (boolean), `interactive` (boolean), `json` (boolean)
    - Validate: `--list` needs no other required options; otherwise `--package` and `--out` required; `--values` required unless `--interactive`
    - _Requirements: 1.1, 3.4, 4.1, 5.1, 6.1, 9.1_

  - [x] 1.2 Implement `buildInstantiateRegistry(templateDir, fileSystem)` helper
    - Scan template directory entries, load `scene-package.json` for each, build array of `{ name, contract, variables, files, extends, layer, template_dir, valid, issues }`
    - Reuse existing scanning logic pattern from `runScenePackageRegistryCommand`
    - _Requirements: 1.1, 6.1, 10.1_

  - [x]* 1.3 Write unit tests for option normalization and validation
    - Test all normalize/validate combinations: list mode, dry-run, interactive, missing required options
    - _Requirements: 1.1, 4.1, 6.1_

- [x] 2. Implement manifest builder, log writer, and post-hook executor
  - [x] 2.1 Implement `buildInstantiationManifest(packageName, chain, resolvedValues, renderedFiles, outputDir)`
    - Build manifest object with: `package_name`, `inheritance_chain`, `variables_used`, `files_generated` (path + size), `generated_at` (ISO 8601), `output_directory`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Implement `appendInstantiationLog(logPath, entry, fileSystem)`
    - Read existing log array or create empty array if file doesn't exist
    - Append entry with: `package_name`, `inheritance_chain`, `variables_used`, `files_generated_count`, `generated_at`, `output_directory`
    - Write back as JSON with 2-space indentation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 2.3 Implement `executePostInstantiateHook(hookCommand, workingDir)`
    - Execute shell command via `child_process.execSync` in working directory
    - Return `{ executed: true, exit_code: 0 }` on success, `{ executed: true, exit_code: N, warning }` on failure
    - Return `{ executed: false }` if no hook command
    - _Requirements: 7.1, 7.2, 7.4_

  - [x]* 2.4 Write property test for manifest completeness
    - **Property 1: Manifest completeness and validity**
    - **Validates: Requirements 1.5, 2.1, 2.2, 2.3**

  - [x]* 2.5 Write property test for log accumulation
    - **Property 7: Instantiation log accumulation**
    - **Validates: Requirements 8.1, 8.3, 8.4**

  - [x]* 2.6 Write property test for post-hook failure tolerance
    - **Property 11: Post-hook failure does not fail instantiation**
    - **Validates: Requirements 7.2**

- [x] 3. Implement interactive prompting and values parsing
  - [x] 3.1 Implement `promptMissingVariables(schema, currentValues, prompter)`
    - Identify required variables not in `currentValues` and without defaults
    - Build inquirer prompt config with name, type, description, default for each
    - Call `prompter` (injected inquirer.prompt) and merge results into values
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Implement `parseInstantiateValues(rawValues, projectRoot, fileSystem)` helper
    - If `rawValues` ends with `.json`, read from file path
    - Otherwise parse as inline JSON string
    - Return parsed object or throw descriptive error
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 3.3 Write property test for values parsing dispatch
    - **Property 8: Values parsing dispatch**
    - **Validates: Requirements 9.1, 9.2**

  - [x]* 3.4 Write property test for interactive prompting
    - **Property 4: Interactive prompting merges missing variables**
    - **Validates: Requirements 3.1, 3.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement main command runner and print function
  - [x] 5.1 Implement `printSceneInstantiateSummary(options, payload, projectRoot)`
    - Human-readable output with chalk formatting for normal, list, and dry-run modes
    - JSON output when `--json` is set
    - _Requirements: 5.1, 5.2, 6.1_

  - [x] 5.2 Implement `runSceneInstantiateCommand(rawOptions, dependencies)` — list mode branch
    - Normalize → validate → build registry → format package list → print
    - Handle empty registry with informative message
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.3 Implement `runSceneInstantiateCommand` — dry-run mode branch
    - Normalize → validate → build registry → find package → resolve inheritance → parse values → (interactive prompt if needed) → validate variables → compute file plan → print plan (no file writes)
    - Include hook command in plan if defined
    - _Requirements: 4.1, 4.2, 4.3, 7.3_

  - [x] 5.4 Implement `runSceneInstantiateCommand` — normal execution branch
    - Full pipeline: resolve package → merge inheritance → parse values → (interactive prompt) → validate → render files → write manifest → write log → execute hook → print summary
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.1_

  - [x] 5.5 Register `scene instantiate` subcommand in `registerSceneCommands`
    - Wire options: `--package`, `--values`, `--out`, `--template-dir`, `--list`, `--dry-run`, `--interactive`, `--json`
    - Wire action handler to `runSceneInstantiateCommand`
    - _Requirements: 1.1_

  - [x] 5.6 Export all new functions in `module.exports`
    - Export: `normalizeSceneInstantiateOptions`, `validateSceneInstantiateOptions`, `buildInstantiateRegistry`, `buildInstantiationManifest`, `appendInstantiationLog`, `executePostInstantiateHook`, `promptMissingVariables`, `parseInstantiateValues`, `printSceneInstantiateSummary`, `runSceneInstantiateCommand`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x]* 5.7 Write property test for dry-run writes no files
    - **Property 2: Dry-run writes no files**
    - **Validates: Requirements 4.1, 4.3, 8.5**

  - [x]* 5.8 Write property test for missing package error
    - **Property 6: Missing package produces error**
    - **Validates: Requirements 1.6**

  - [x]* 5.9 Write property test for non-interactive missing variables
    - **Property 5: Non-interactive missing variables produce errors**
    - **Validates: Requirements 3.4, 1.7**

  - [x]* 5.10 Write property test for list mode
    - **Property 9: List mode shows all registry packages**
    - **Validates: Requirements 6.1**

  - [x]* 5.11 Write property test for backward compatibility
    - **Property 13: Backward compatibility for existing contracts**
    - **Validates: Requirements 10.5**

  - [x]* 5.12 Write unit tests for command runner integration
    - Test all modes: normal happy path, list, dry-run, interactive (mocked inquirer), JSON output
    - Test error paths: missing package, validation failure, values parse error
    - _Requirements: 1.1-1.7, 4.1-4.3, 5.1-5.2, 6.1-6.3, 7.1-7.4, 8.1-8.5_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All code goes in `lib/commands/scene.js`, tests in `tests/unit/commands/scene.test.js`
- No new external dependencies — inquirer is already in package.json, child_process is Node.js built-in
- Property tests use fast-check with minimum 100 iterations each
- Each task references specific requirements for traceability
- Reuses existing functions: `resolveTemplateInheritance`, `validateTemplateVariables`, `renderTemplateFiles`, registry scanning logic
- Optional backlog closeout evidence is recorded in `custom/instantiate-test-closeout-2026-03-12.md`
