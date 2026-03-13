# Implementation Plan: Scene Template Engine Foundation

## Overview

Implement the template engine foundation in `lib/commands/scene.js` following the existing normalize → validate → execute → print pattern. All new functions are added to the same file and exported. Tests go in `tests/unit/commands/scene.test.js`.

## Tasks

- [x] 1. Add constants and template variable schema validator
  - [x] 1.1 Add `TEMPLATE_VARIABLE_TYPES` constant and `validateTemplateVariableSchema(variables)` function
    - Add `const TEMPLATE_VARIABLE_TYPES = new Set(['string', 'number', 'boolean', 'enum', 'array'])`
    - Add `const TEMPLATE_LAYER_VALUES = new Set(['l1-capability', 'l2-domain', 'l3-instance'])`
    - Implement `validateTemplateVariableSchema(variables)` that validates each variable entry for name, type, required, default, description, validation fields
    - Return `{ valid, errors, warnings, summary: { variable_count, type_breakdown } }`
    - _Requirements: 1.1, 1.2, 1.3, 5.1_

  - [x] 1.2 Implement `validateTemplateVariables(schema, values)` function
    - Validate required fields, fill defaults, check types (string/number/boolean/enum/array)
    - Apply validation rules: regex for strings, enum_values for enums, min/max for numbers
    - Collect ALL errors before returning (no early exit)
    - Return `{ valid, errors, resolved }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x]* 1.3 Write property tests for schema validation
    - **Property 1: Valid schema acceptance**
    - **Validates: Requirements 1.1, 1.2**
    - **Property 2: Invalid type rejection**
    - **Validates: Requirements 1.3**

  - [x]* 1.4 Write property tests for variable validation
    - **Property 3: Valid schema and values acceptance**
    - **Validates: Requirements 2.1**
    - **Property 4: Default value filling**
    - **Validates: Requirements 2.2**
    - **Property 5: Missing required variable error**
    - **Validates: Requirements 1.5, 2.3**
    - **Property 6: Validation rule enforcement**
    - **Validates: Requirements 2.5, 2.6, 2.7**
    - **Property 7: All errors collected**
    - **Validates: Requirements 2.8**

  - [x]* 1.5 Write unit tests for schema and variable validation edge cases
    - Empty schema array, empty values object
    - Variable with no name, variable with no type
    - Boolean/array type validation
    - _Requirements: 1.1, 1.2, 1.3, 2.1-2.8_

- [x] 2. Implement template rendering engine
  - [x] 2.1 Implement `renderTemplateContent(content, valueMap)` function
    - Process `{{#each items}}...{{/each}}` loops (replace `{{this}}` with each element)
    - Process `{{#if variable}}...{{/if}}` conditionals (include block if truthy)
    - Process `{{variable_name}}` placeholder substitution
    - Leave unresolved placeholders unchanged
    - _Requirements: 3.2, 3.3, 3.4, 3.7_

  - [x] 2.2 Implement `renderTemplateFiles(templateDir, variables, outputDir, fileSystem)` function
    - Call `validateTemplateVariables` first; return errors if validation fails
    - Recursively walk templateDir, render each file, write to outputDir preserving structure
    - Return `{ rendered, errors, files, summary }`
    - _Requirements: 3.1, 3.5, 3.6_

  - [x]* 2.3 Write property tests for template rendering
    - **Property 8: Placeholder substitution**
    - **Validates: Requirements 3.2**
    - **Property 9: Conditional block evaluation**
    - **Validates: Requirements 3.3**
    - **Property 10: Loop block evaluation**
    - **Validates: Requirements 3.4**
    - **Property 11: Rendering idempotence**
    - **Validates: Requirements 4.1**
    - **Property 12: Complete substitution**
    - **Validates: Requirements 4.2**
    - **Property 13: Unknown placeholder passthrough**
    - **Validates: Requirements 3.7**

  - [x]* 2.4 Write unit tests for renderTemplateFiles
    - Test validation-before-render gate (invalid variables → no output)
    - Test directory structure preservation
    - Test empty template directory
    - _Requirements: 3.1, 3.5, 3.6_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement three-layer inheritance resolver
  - [x] 4.1 Implement `resolveTemplateInheritance(registryTemplates, packageName)` function
    - Traverse `extends` chain from target to root using visited-set for cycle detection
    - Merge variable schemas (child overrides parent by name)
    - Merge template file lists (child overrides parent at same path)
    - Return `{ resolved, chain, mergedVariables, mergedFiles, errors }`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 4.2 Write property tests for inheritance resolution
    - **Property 14: Inheritance chain traversal**
    - **Validates: Requirements 5.3**
    - **Property 15: Inheritance merge override**
    - **Validates: Requirements 5.4, 5.5**
    - **Property 16: Circular inheritance detection**
    - **Validates: Requirements 5.6**

  - [x]* 4.3 Write unit tests for inheritance edge cases
    - Missing parent package, single-level (no extends), deeply nested chain (3+ levels)
    - _Requirements: 5.6, 5.7_

- [x] 5. Implement CLI commands
  - [x] 5.1 Add normalize/validate functions for three new commands
    - `normalizeSceneTemplateRenderOptions` / `validateSceneTemplateRenderOptions`
    - `normalizeSceneTemplateValidateOptions` / `validateSceneTemplateValidateOptions`
    - `normalizeSceneTemplateResolveOptions` / `validateSceneTemplateResolveOptions`
    - _Requirements: 6.1, 7.1, 8.1_

  - [x] 5.2 Implement `runSceneTemplateValidateCommand(rawOptions, dependencies)`
    - Load scene-package.json → run contract validation → run schema validation → print summary
    - Support `--json` output
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 5.3 Implement `runSceneTemplateResolveCommand(rawOptions, dependencies)`
    - Build registry → resolve inheritance → print merged schema
    - Support `--json` output
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 5.4 Implement `runSceneTemplateRenderCommand(rawOptions, dependencies)`
    - Resolve package from registry → load contract → validate variables → render files → print summary
    - Support `--json` output and `--values` (JSON path or inline)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 5.5 Implement print functions for all three commands
    - `printSceneTemplateRenderSummary`, `printSceneTemplateValidateSummary`, `printSceneTemplateResolveSummary`
    - Human-readable output with chalk formatting
    - _Requirements: 6.2, 7.2, 7.4, 8.2_

  - [x] 5.6 Register three new subcommands in `registerSceneCommands`
    - `scene template-render`, `scene template-validate`, `scene template-resolve`
    - Wire options and action handlers
    - _Requirements: 6.1, 7.1, 8.1_

  - [x]* 5.7 Write unit tests for CLI option normalization and validation
    - Test all normalize/validate functions for the three commands
    - _Requirements: 6.1, 7.1, 8.1_

  - [x]* 5.8 Write unit tests for command runners
    - Happy path, error paths, --json mode for all three commands
    - _Requirements: 6.1-6.4, 7.1-7.4, 8.1-8.3_

- [x] 6. Export new functions and backward compatibility
  - [x] 6.1 Add all new functions to module.exports
    - Export: validateTemplateVariableSchema, validateTemplateVariables, renderTemplateContent, renderTemplateFiles, resolveTemplateInheritance
    - Export: normalize/validate/run functions for all three commands
    - _Requirements: 9.1, 9.2, 9.3_

  - [x]* 6.2 Write property test for backward compatibility
    - **Property 17: Backward compatibility**
    - **Validates: Requirements 9.4**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All code goes in `lib/commands/scene.js`, tests in `tests/unit/commands/scene.test.js`
- No new external dependencies — template rendering is pure JS string processing
- Property tests use fast-check with minimum 100 iterations each
- Each task references specific requirements for traceability
- Test evidence for the optional backlog closeout is recorded in `custom/template-test-closeout-2026-03-12.md`
