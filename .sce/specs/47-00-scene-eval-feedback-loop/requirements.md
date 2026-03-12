# Requirements Document: Scene Eval Feedback Loop

## Introduction

Scene runtime already supports `run` and `doctor` outputs, including a doctor feedback template.
To complete the governance loop, SCE needs a machine-readable evaluation stage that aggregates
runtime evidence and feedback records into one report for iteration decisions.

## Requirements

### Requirement 1: Eval Command Entry
- Add `sce scene eval` command for closed-loop evaluation.
- Accept run result JSON input (`--result`) and/or doctor feedback markdown input (`--feedback`).
- Reject invocation when neither input is provided.

### Requirement 2: Feedback Template Parsing
- Parse doctor feedback template markdown into structured task records.
- Capture scene metadata, trace id, task status, ownership/evidence fields, and eval metrics.
- Handle templates without synced tasks safely.

### Requirement 3: Scoring and Aggregation
- Compute run-side score from runtime eval payload.
- Compute feedback-side score from task completion/blocking and eval metrics.
- Produce combined overall score + grade + recommendations.

### Requirement 4: Output and Reporting
- Support optional target configuration via `--target` JSON.
- Support optional report export path via `--out`.
- Support JSON and human-readable summaries consistent with other scene commands.

### Requirement 5: Regression Safety
- Add unit coverage for parser behavior and eval command report generation.
- Keep existing scene command/runtime tests passing.
- Verify CLI help for `scene eval` and run smoke execution on real artifacts.
