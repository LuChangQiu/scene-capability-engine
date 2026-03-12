# Requirements Document: Scene Runtime CLI Integration

## Introduction

The runtime pilot from spec `37-00-scene-runtime-execution-pilot` already provides loader, compiler, policy gate, executor, audit emitter, and eval bridge.
This spec exposes that runtime as an operator-facing CLI entry so scene execution can be invoked in a standard SCE workflow.

## Requirements

### Requirement 1: Scene Run Entry
- Provide `sce scene run` command.
- Support scene source from either `--spec <spec-name>` or `--manifest <path>`.
- Reject invalid source combinations and invalid mode values.

### Requirement 2: Runtime Context Injection
- Support runtime context loading via `--context-file <path>`.
- Support explicit policy-related flags (`--approved`, `--dual-approved`, safety flags) to override or supplement context.

### Requirement 3: Execution and Output
- Execute runtime with `--mode dry_run|commit`.
- Support output persistence using `--plan-out` and `--result-out`.
- Support structured console output via `--json`.

### Requirement 4: Guardrails and Exit Semantics
- Return non-zero exit semantics for invalid options and denied/failed runs.
- Keep dry_run/commit behavior aligned with runtime pilot policy rules.
