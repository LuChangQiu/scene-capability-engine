# Design Document: Scene Eval Feedback Loop

## Overview

Introduce a dedicated `scene eval` command to close the loop:

1. `scene run` emits runtime evidence (`result.json`).
2. `scene doctor` emits task-oriented feedback template.
3. `scene eval` aggregates both into one evaluable report.

## Command Surface

`sce scene eval [options]`

- `--result <path>`: scene run result JSON.
- `--feedback <path>`: doctor feedback template markdown.
- `--target <path>`: target thresholds JSON.
- `--out <path>`: write evaluation report JSON.
- `--json`: print report as JSON.

At least one of `--result` or `--feedback` is required.

## Core Components

### 1) Parser
- `parseDoctorFeedbackTemplate(markdown)` parses:
  - scene metadata (`scene_ref`, `scene_version`, `trace_id`),
  - task metadata (`task_id`, priority, suggestion code),
  - checklist fields (`status`, owner, evidence, notes),
  - eval metrics (`cycle_time_ms`, `policy_violation_count`, `node_failure_count`, `manual_takeover_rate`).

### 2) Evaluation Builders
- Run evaluation:
  - Uses existing `EvalBridge.score` when `result.eval_payload.metrics` exists.
- Feedback evaluation:
  - Builds task summary and metric summary.
  - Applies threshold-based penalties to derive feedback score.
- Overall evaluation:
  - Weighted combination (`run=0.6`, `feedback=0.4` when both present; fallback to single source).
  - Adds grade and deduplicated recommendations.

### 3) Reporting
- `printEvalSummary` for terminal output.
- Optional JSON report export with absolute and relative output paths.

## Data Contract

Evaluation report includes:

- `scene_ref`, `scene_version`, `trace_id`
- `inputs` (result/feedback/target sources)
- `run_evaluation` (`metrics`, `score`, status context)
- `feedback_evaluation` (`task_summary`, `metric_summary`, `score`)
- `overall` (`score`, `grade`, `recommendations`)
- optional `output_path`, `output_abs_path`

## Compatibility

- Existing `scene run|doctor|validate|scaffold` flows remain unchanged.
- Eval is additive and can run with only one input source.
- Backward compatible with feedback templates that have no synced tasks.
