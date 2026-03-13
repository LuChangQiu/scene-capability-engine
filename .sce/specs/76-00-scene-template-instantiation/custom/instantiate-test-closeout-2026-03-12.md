# Scene Template Instantiation Test Closeout

Date: 2026-03-12

## Scope

- Closed the remaining optional test backlog for `76-00-scene-template-instantiation`.
- Added dedicated unit coverage for option handling and `runSceneInstantiateCommand` integration paths.
- Added property coverage for manifest generation, log accumulation, hook failure tolerance, values parsing, prompting, dry-run safety, missing package handling, validation errors, list mode, and backward compatibility.

## Changes

- `tests/unit/commands/scene-template-instantiation.test.js`
  - Covers instantiate option normalization and validation
  - Covers list, dry-run, normal, and interactive runner paths
  - Covers JSON output and key failure paths
- `tests/unit/commands/scene-template-instantiation.property.test.js`
  - Property: manifest completeness and validity
  - Property: instantiation log accumulation
  - Property: post-hook failure does not fail instantiation
  - Property: values parsing dispatch
  - Property: interactive prompting merges missing variables
  - Property: dry-run writes no files
  - Property: missing package produces error
  - Property: non-interactive missing variables produce errors
  - Property: list mode shows all registry packages
  - Property: backward compatibility for existing contracts

## Verification

- `npx jest tests/unit/commands/scene-template-instantiation.test.js tests/unit/commands/scene-template-instantiation.property.test.js --runInBand`

## Outcome

- `76-00-scene-template-instantiation` optional test backlog is closed.
