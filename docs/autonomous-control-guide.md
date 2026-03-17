# Autonomous Control Guide

## Overview

The Autonomous Control feature transforms sce from an interactive assistant into an autonomous development partner. AI can independently manage entire development workflows - from understanding user goals to delivering production-ready features.

**Key Capabilities**:
- **Autonomous Spec Creation**: Generate requirements, design, and tasks without step-by-step confirmation
- **Automatic Closed-Loop Progression**: Execute continuously toward completion without manual phase-by-phase confirmations
- **Automatic Master/Sub Portfolio Split**: Decompose broad goals into dependency-wired multi-spec plans
- **Semantic Goal Decomposition**: Use clause/category analysis to infer decomposition tracks from mixed-language goals
- **Continuous Task Execution**: Execute multiple tasks without interruption
- **Intelligent Error Recovery**: Automatically diagnose and fix errors (3 retry attempts)
- **Program Convergence Gate**: Enforce minimum success-rate + risk threshold before program reports final pass
- **Strategic Checkpoints**: Pause only at meaningful milestones for user review
- **Learning System**: Improve over time by learning from successes and failures
- **Safety Boundaries**: Respect workspace boundaries, require confirmation for sensitive operations

## Quick Start

### Run a Goal as an Autonomous Closed Loop

```bash
# Single command:
# 1) auto decompose goal into master/sub specs
# 2) initialize collaboration metadata and assignments
# 3) run orchestration to terminal state
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce"

# Disable live status stream output when running in quiet terminals
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce" --no-stream

# Add final Definition-of-Done (DoD) test gate
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce" \
  --dod-tests "npm run test:smoke"

# Strict DoD: require all tasks checklists are closed
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce" \
  --dod-tasks-closed

# Persist DoD evidence into a custom report file
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce" \
  --dod-report ".sce/reports/close-loop-dod.json"

# Resume interrupted close-loop from latest session
sce auto close-loop --resume latest

# Resume interrupted close-loop from a specific session id
sce auto close-loop --resume 117-20260214230000

# Increase automatic replan budget after orchestration failures
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce" \
  --replan-attempts 2

# Use fixed replan budget strategy (adaptive is default)
sce auto close-loop "build autonomous close-loop and master/sub multi-spec execution for sce" \
  --replan-attempts 2 \
  --replan-strategy fixed

# Batch mode: run multiple goals autonomously (each goal gets its own master/sub portfolio)
sce auto close-loop-batch .sce/goals.json --json

# Program mode: decompose one broad goal into multiple batch goals automatically
sce auto close-loop-batch \
  --decompose-goal "build autonomous close-loop, master/sub decomposition, orchestration and quality rollout" \
  --program-goals 4 \
  --program-min-quality-score 85 \
  --program-quality-gate \
  --json

# Program command: broad goal -> semantic decomposition -> autonomous batch closed-loop
sce auto close-loop-program \
  "build autonomous close-loop, master/sub decomposition, orchestration and quality rollout" \
  --program-goals 4 \
  --program-quality-gate \
  --program-recover-max-rounds 6 \
  --program-recover-max-minutes 30 \
  --program-gate-profile staging \
  --program-gate-fallback-chain staging,prod \
  --program-gate-fallback-profile prod \
  --program-min-success-rate 95 \
  --program-max-risk-level medium \
  --program-max-elapsed-minutes 60 \
  --program-max-agent-budget 12 \
  --program-max-total-sub-specs 80 \
  --program-kpi-out .sce/reports/close-loop-program-kpi.json \
  --program-audit-out .sce/reports/close-loop-program-audit.json \
  --json

Use this path when the problem is broader than one Spec and already clearly points to multiple coordinated implementation tracks.

If the problem is still too unclear for direct implementation splitting, treat it as a research-first program and clarify domains/contracts/rules before expecting stable executable tasks from child Specs.

Suggested preflight:

```bash
sce spec strategy assess --goal "broad complex goal" --json
```

If you are already inside a single Spec flow, `sce spec gate run --spec <spec-id>` and `sce spec pipeline run --spec <spec-id>` now echo the same strategy concern as a non-blocking advisory when one Spec is no longer the right execution container.

# Controller command: drain queue goals with autonomous close-loop-program runtime
sce auto close-loop-controller .sce/auto/program-queue.lines \
  --dequeue-limit 2 \
  --max-cycles 20 \
  --controller-done-file .sce/auto/program-done.lines \
  --controller-failed-file .sce/auto/program-failed.lines \
  --json

# Persistent controller mode: keep polling queue and execute new goals automatically
sce auto close-loop-controller .sce/auto/program-queue.lines \
  --wait-on-empty \
  --poll-seconds 30 \
  --max-cycles 1000 \
  --max-minutes 240

# Resume from latest persisted controller session
sce auto close-loop-controller --controller-resume latest --json

# Recovery command: consume diagnostics and auto-recover unresolved goals
sce auto close-loop-recover latest --json
sce auto close-loop-recover .sce/auto/close-loop-batch-summaries/batch-20260215090000.json \
  --use-action 2 \
  --recover-until-complete \
  --recover-max-rounds 3 \
  --recover-max-minutes 20 \
  --recovery-memory-ttl-days 30 \
  --recovery-memory-scope release-main \
  --program-audit-out .sce/reports/close-loop-recover-audit.json \
  --dry-run --json

# Default autonomous batch run (continue-on-error + adaptive scheduling + retry-until-complete)
sce auto close-loop-batch .sce/goals.json --json

# Batch parallel mode: run multiple goals concurrently
sce auto close-loop-batch .sce/goals.json --batch-parallel 3 --json

# Batch with global agent budget (automatic per-goal maxParallel throttling)
sce auto close-loop-batch .sce/goals.json \
  --batch-parallel 3 \
  --batch-agent-budget 6 \
  --json

# Batch priority scheduling with aging (favor complex goals, prevent starvation)
sce auto close-loop-batch .sce/goals.json \
  --batch-priority critical-first \
  --batch-aging-factor 3 \
  --json

# Auto-retry failed/stopped goals in the same batch run
sce auto close-loop-batch .sce/goals.json \
  --batch-retry-rounds 1 \
  --batch-retry-strategy adaptive \
  --json

# Keep retrying until all goals complete (bounded)
sce auto close-loop-batch .sce/goals.json \
  --batch-retry-until-complete \
  --batch-retry-max-rounds 10 \
  --json

# Disable autonomous closed-loop batch policy (only when you need legacy/manual tuning)
sce auto close-loop-batch .sce/goals.json \
  --no-batch-autonomous \
  --json

# Resume a stopped/failed batch from previous summary output
sce auto close-loop-batch --resume-from-summary .sce/reports/close-loop-batch.json --json

# Resume from latest persisted batch summary session
sce auto close-loop-batch --resume-from-summary latest --json

# Resume only failed/error goals from summary
sce auto close-loop-batch --resume-from-summary .sce/reports/close-loop-batch.json \
  --resume-strategy failed-only --json

# Batch dry-run for portfolio planning only
sce auto close-loop-batch .sce/goals.txt --format lines --dry-run --json
```

Default DoD gates:
- Spec docs exist (`requirements.md`, `design.md`, `tasks.md`)
- Orchestration reaches `completed` terminal state (unless `--no-run`)
- Collaboration statuses are reconciled to `completed` (unless `--no-run`)

Optional DoD gates:
- `--dod-tests <command>`: run a final validation command
- `--dod-tests-timeout <ms>`: timeout for test gate command
- `--dod-tasks-closed`: enforce closed checklist items in `tasks.md`

DoD evidence archive:
- Default output: `.sce/specs/<master-spec>/custom/dod-report.json`
- `--dod-report <path>`: override report path
- `--no-dod-report`: disable report generation

Session persistence and resume:
- Default session archive: `.sce/auto/close-loop-sessions/*.json`
- `--session-id <id>`: override generated session id
- `--resume <session-or-file>`: continue from prior session (supports `latest`)
- `--no-session`: disable session snapshot persistence
- `--session-keep <n>`: automatically prune old snapshots and keep newest `n` after each close-loop run
- `--session-older-than-days <n>`: when pruning, only delete snapshots older than `n` days
- `sce auto session list [--limit <n>] [--status <csv>]`: inspect persisted sessions (`--status` supports comma-separated, case-insensitive filters)
- `sce auto session stats [--days <n>] [--status <csv>] [--json]`: aggregate session status/topology telemetry in an optional recent-day window
- `sce auto session prune --keep <n> [--older-than-days <n>]`: enforce retention policy
  - List JSON output includes `status_filter` and `status_counts` for filtered session distributions.
  - Stats JSON output includes `criteria`, completion/failure rates, `sub_spec_count_sum`, `master_spec_counts`, and `latest_sessions`.

Spec directory maintenance:
- `sce auto spec-session list [--limit <n>] [--json]`: inspect spec directory inventory under `.sce/specs`
- `sce auto spec-session prune --keep <n> [--older-than-days <n>] [--no-protect-active] [--protect-window-days <n>] [--show-protection-reasons] [--dry-run] [--json]`: prune old spec directories by retention policy (default protects active/recent specs)
  - Protection sources include collaboration state, close-loop sessions, batch summaries, and controller sessions (via nested batch summary references).
  - JSON output always includes `protection_ranking_top`; enable `--show-protection-reasons` for full `protection_ranking` and per-spec reason payload.

Batch summary session persistence and maintenance:
- Default batch summary archive: `.sce/auto/close-loop-batch-summaries/*.json`
- `--batch-session-id <id>`: override generated batch summary session id
- `--batch-session-keep <n>`: auto-prune archive and keep newest `n` summaries after each batch run
- `--batch-session-older-than-days <n>`: when pruning, only delete summaries older than `n` days
- `--no-batch-session`: disable batch summary archive for the current run
- `sce auto batch-session list [--limit <n>] [--status <csv>]`: inspect persisted batch summary sessions (`--status` supports comma-separated, case-insensitive filters)
- `sce auto batch-session stats [--days <n>] [--status <csv>] [--json]`: aggregate batch session status/goal-volume telemetry in an optional recent-day window
- `sce auto batch-session prune --keep <n> [--older-than-days <n>]`: enforce batch summary retention policy
  - List JSON output includes `status_filter` and `status_counts` for filtered status composition.
  - Stats JSON output includes `criteria`, completion/failure rates, goal-volume sums, processed ratio, and `latest_sessions`.

Controller summary session persistence and maintenance:
- Default controller summary archive: `.sce/auto/close-loop-controller-sessions/*.json`
- `--controller-session-id <id>`: override generated controller session id
- `--controller-session-keep <n>`: auto-prune archive and keep newest `n` summaries after each controller run
- `--controller-session-older-than-days <n>`: when pruning, only delete summaries older than `n` days
- `--no-controller-session`: disable controller summary archive for the current run
- `sce auto controller-session list [--limit <n>] [--status <csv>]`: inspect persisted controller summary sessions (`--status` supports comma-separated, case-insensitive filters)
- `sce auto controller-session stats [--days <n>] [--status <csv>] [--json]`: aggregate controller session status/throughput telemetry in an optional recent-day window
- `sce auto controller-session prune --keep <n> [--older-than-days <n>]`: enforce controller summary retention policy
  - List JSON output includes `status_filter` and `status_counts` for filtered status composition.
  - Stats JSON output includes `criteria`, `status_counts`, `queue_format_counts`, completion/failure rates, goal-volume sums, and `latest_sessions`.

Cross-archive governance snapshot:
- `sce auto governance stats [--days <n>] [--status <csv>] [--json]`: aggregate a unified governance cockpit over session/batch/controller archives plus recovery memory state.
  - JSON output includes `totals`, `throughput`, `top_master_specs`, per-archive `archives.*` stats payloads, and `health` diagnostics (`risk_level`, `concerns`, `recommendations`) for one-command close-loop governance checks.
- `sce auto governance maintain [--days <n>] [--status <csv>] [--session-keep <n>] [--batch-session-keep <n>] [--controller-session-keep <n>] [--recovery-memory-older-than-days <n>] [--apply] [--dry-run] [--json]`: close-loop governance maintenance entrypoint.
  - Default is plan-only (`assessment` + `plan`).
  - `--apply` executes maintenance actions for archive hygiene (session/batch/controller pruning + recovery-memory stale-entry pruning).
  - `--dry-run` can be combined with `--apply` to validate maintenance impact before deletion.
- `sce auto governance close-loop [--max-rounds <n>] [--target-risk <low|medium|high>] [--governance-resume <session|latest|file>] [--governance-resume-allow-drift] [--governance-session-id <id>] [--no-governance-session] [--governance-session-keep <n>] [--governance-session-older-than-days <n>] [--execute-advisory] [--advisory-recover-max-rounds <n>] [--advisory-controller-max-cycles <n>] [--plan-only] [--dry-run] [--json]`: governance round-loop runner.
  - Orchestrates repeated `governance maintain` rounds until target risk or stop condition is reached.
  - Governance close-loop sessions persist by default at `.sce/auto/governance-close-loop-sessions`; use `--governance-resume` to continue interrupted governance loops.
  - Resume defaults inherit persisted governance policy (`target_risk`, `execute_advisory`, `advisory_policy`) to avoid accidental configuration drift; explicit drift is blocked unless `--governance-resume-allow-drift` is set.
  - `--governance-session-keep` enables automatic post-run governance session pruning (optional age window via `--governance-session-older-than-days`) while preserving the current run session file.
  - `--execute-advisory` enables automatic advisory action execution when detected (`recover-latest`, `controller-resume-latest`), with autonomous source selection (latest recoverable summary / latest pending controller session) and `skipped` telemetry when no actionable source exists.
  - Emits round history (`risk_before`/`risk_after`, planned/applicable/applied/failed actions), advisory telemetry (`advisory_*` fields), plus initial/final assessments for auditable autonomous governance convergence.
- `sce auto governance session list [--limit <n>] [--status <csv>] [--resume-only] [--json]`: inspect persisted governance close-loop session archive (optional resumed-chain filter).
- `sce auto governance session stats [--days <n>] [--status <csv>] [--resume-only] [--json]`: aggregate governance session completion/failure/convergence/risk telemetry with resumed-session ratio/source breakdown.
- `sce auto governance session prune [--keep <n>] [--older-than-days <n>] [--dry-run] [--json]`: enforce governance session retention policy.

Recovery memory maintenance:
- Default recovery memory file: `.sce/auto/close-loop-recovery-memory.json`
- `sce auto recovery-memory show [--scope <scope>] [--json]`: inspect learned failure signatures and action stats (optionally by scope)
- `sce auto recovery-memory scopes [--json]`: inspect aggregated recovery-memory metrics grouped by scope
- `sce auto recovery-memory prune [--older-than-days <n>] [--scope <scope>] [--dry-run] [--json]`: prune stale memory entries (optionally by scope)
- `sce auto recovery-memory clear [--json]`: clear learned recovery memory

Automatic decomposition scale:
- Default sub-spec count is inferred from goal complexity (typically `3-5`)
- Use `--subs <n>` to pin a specific decomposition size (`2-5`)

Automatic failure replanning:
- Default behavior: one remediation replan cycle after failed orchestration
- `--replan-attempts <n>`: set replan budget (`0-5`)
- `--replan-strategy <strategy>`: choose `adaptive` (default) or `fixed` cycle budget
- `--replan-no-progress-window <n>`: stop replanning when no net progress persists for `n` failed cycles (`1-10`, default `3`)
- `--no-replan`: disable remediation replan cycles
- Repeated failed-spec signatures auto-stop replanning to prevent infinite low-value retry loops

Batch multi-goal autonomous execution:
- Command: `sce auto close-loop-batch <goals-file>`
- Goals file formats: JSON array / JSON `{ "goals": [] }` / line-based text
- `--format <auto|json|lines>`: force parser mode when needed
- `--decompose-goal <goal>`: generate batch goals from one broad goal using semantic decomposition
- `--program-goals <n>`: target generated-goal count for `--decompose-goal` (`2-12`, default adaptive)
- `--program-min-quality-score <n>`: minimum decomposition quality score before automatic refinement (`0-100`, default `70`)
- `--program-quality-gate`: fail fast when final decomposition quality remains below `--program-min-quality-score`
- `--resume-from-summary <path>`: resume only pending goals from previous batch summary
- `--resume-from-summary latest`: resolve and resume from latest persisted batch summary session
- `--resume-strategy <pending|failed-only>`: control whether summary resume includes unprocessed goals (`pending`) or only failed/error goals (`failed-only`)
- `--batch-parallel <n>`: run multiple goals concurrently (`1-20`, default adaptive under autonomous policy)
- `--batch-agent-budget <n>`: set global agent parallel budget shared across all active goals (`1-500`)
- `--batch-priority <strategy>`: choose `fifo`, `complex-first`, `complex-last`, or `critical-first` scheduling (default `complex-first` under autonomous policy)
- `--batch-aging-factor <n>`: increase waiting-goal score per scheduling cycle (`0-100`, default `2` under autonomous policy)
- `--batch-retry-rounds <n>`: automatically retry failed/stopped goals for `n` extra rounds (`0-5`, default `0`, or until-complete under autonomous policy)
- `--batch-retry-strategy <strategy>`: choose `adaptive` (default) or `strict` retry behavior
- `--batch-retry-until-complete`: enable goal-draining retry mode until completion or max rounds
- `--batch-retry-max-rounds <n>`: max extra rounds for until-complete mode (`1-20`, default `10`)
- `--no-batch-autonomous`: disable autonomous defaults and use explicit batch flags only
- `--batch-session-id <id>`: set explicit id for persisted batch summary session
- `--batch-session-keep <n>`: keep newest `n` persisted batch summary sessions (`0-1000`)
- `--batch-session-older-than-days <n>`: when pruning persisted batch summaries, only delete sessions older than `n` days (`0-36500`)
- `--spec-session-keep <n>`: keep newest `n` spec directories under `.sce/specs` after run (`0-5000`)
- `--spec-session-older-than-days <n>`: when pruning specs, only delete directories older than `n` days (`0-36500`)
- `--no-spec-session-protect-active`: allow pruning active/recently referenced spec directories
- `--spec-session-protect-window-days <n>`: protection window (days) for recent session references during spec pruning (`0-36500`, default `7`)
- `--spec-session-max-total <n>`: spec directory budget ceiling under `.sce/specs` (`1-500000`)
- `--spec-session-max-created <n>`: spec growth guard for maximum estimated created directories per run (`0-500000`)
- `--spec-session-max-created-per-goal <n>`: spec growth guard for estimated created directories per processed goal (`0-1000`)
- `--spec-session-max-duplicate-goals <n>`: goal-input duplicate guard for batch inputs (`0-500000`)
- `--spec-session-budget-hard-fail`: fail run when spec count exceeds `--spec-session-max-total` before/after execution
- `--no-batch-session`: disable persisted batch summary session archive for this run
- `--continue-on-error`: continue remaining goals when one goal fails (enabled by default under autonomous policy)
- Returns one summary with per-goal statuses (`completed`, `failed`, `error`, `planned`)
- Summary includes `resource_plan` and aggregate `metrics` (success rate, status breakdown, avg sub-spec count, avg replan cycles)
- `--program-goals` requires `--decompose-goal`, and goal sources are mutually exclusive (`<goals-file>` vs `--resume-from-summary` vs `--decompose-goal`)
- In `--decompose-goal` mode, summary also exposes `generated_from_goal` diagnostics (strategy, target/produced counts, clause/category signals, and `quality` score/warnings)
- Summary also exposes `batch_retry` diagnostics (strategy, until-complete mode, configured/max/performed rounds, exhausted flag, and per-round counters)
- Summary also exposes `batch_session` metadata when persistence is enabled (session id and file path)
- `resource_plan` exposes scheduling telemetry (`scheduling_strategy`, `aging_factor`, `max_wait_ticks`, `starvation_wait_events`) for autonomous portfolio tuning
- In budget mode, complexity-weighted scheduling is enabled (`goal_weight`/`scheduling_weight`) to prioritize shared capacity and reduce concurrent goal count when high-complexity goals are active.
- Each goal still keeps independent session snapshots and governance artifacts

Close-loop program command:
- Command: `sce auto close-loop-program "<goal>"`
- Built for broad, multi-track goals and defaults to autonomous batch closed-loop policy.
- Automatically performs semantic decomposition into multiple goals and executes them as one program.
- `--program-goals <n>` tunes decomposition width (`2-12`, default adaptive).
- Reuses batch execution controls and summary/session persistence controls.
- Program command now includes built-in auto recovery loop by default; it does not require a second manual command.
- `--no-program-auto-recover` disables built-in recovery loop.
- `--program-recover-use-action <n>` pins remediation action for built-in recovery; if omitted, sce picks from recovery memory or falls back to action `1`.
- `--program-recover-resume-strategy <pending|failed-only>` controls recovery scope.
- `--program-recover-max-rounds <n>` sets bounded built-in recovery rounds (`1-20`, default `5`).
- `--program-recover-max-minutes <n>` sets elapsed-time budget for built-in recovery loop (minutes, default unlimited).
- `--program-gate-profile <profile>` sets baseline convergence policy (`default|dev|staging|prod`).
- `--program-gate-fallback-profile <profile>` defines fallback gate profile (`none|default|dev|staging|prod`) when primary gate fails.
- `--program-gate-fallback-chain <profiles>` defines ordered fallback profiles (comma-separated) after primary gate failure.
- `--program-min-success-rate <n>` + `--program-max-risk-level <level>` define the final convergence gate policy.
- `--program-max-elapsed-minutes <n>` + `--program-max-agent-budget <n>` + `--program-max-total-sub-specs <n>` add program budget gates (time/concurrency/sub-spec volume).
- `--no-program-gate-auto-remediate` disables automatic remediation patch/prune hints after gate failure.
- `--program-min-quality-score <n>` enforces decomposition quality threshold and triggers auto refinement when needed.
- `--program-quality-gate` enables hard failure when final decomposition quality still violates threshold.
- `--recovery-memory-scope <scope>` isolates remediation memory by scope (default auto: project + git branch).
- `--spec-session-keep <n>` + `--spec-session-older-than-days <n>` enable automatic spec-directory retention after run.
- `--no-spec-session-protect-active` disables active/recent spec protection during automatic retention prune.
- `--spec-session-protect-window-days <n>` tunes how long recent session references protect specs from pruning.
- `--spec-session-max-total <n>` + `--spec-session-budget-hard-fail` add optional spec-count budget governance for autonomous programs.
- Summary includes `program_kpi` (`convergence_state`, `risk_level`, retry recovery, complexity ratio, wait profile).
- `--program-kpi-out <path>` writes a standalone KPI snapshot JSON for dashboards and audit archives.
- Summary includes `program_gate` verdict (`passed`, policy, actuals, reasons) and returns non-zero when gate fails.
- Summary includes `program_gate_fallbacks` and `program_gate_effective` so fallback gate evaluation is fully auditable.
- `--program-audit-out <path>` writes program/recovery coordination audit JSON for governance traceability.
- Summary also includes `program_diagnostics` (`failure_clusters`, `remediation_actions`) to drive automatic follow-up and convergence recovery.
- Summary includes `program_coordination` (master/sub topology, unresolved goal indexes, scheduler telemetry) and `auto_recovery` metadata.

Close-loop controller command:
- Command: `sce auto close-loop-controller [queue-file]`
- Runs a queue-driven autonomous loop: dequeue broad goals, execute each by `close-loop-program`, persist remaining queue, and continue until stop condition.
- Queue file defaults to `.sce/auto/close-loop-controller-goals.lines`; supports `auto|json|lines` parsing via `--queue-format`.
- `--controller-resume <session-or-file>` resumes queue/controller context from persisted controller session (`latest`, session id, or file path).
- Duplicate broad goals are deduped by default; use `--no-controller-dedupe` to preserve raw queue duplicates.
- `--dequeue-limit <n>` controls how many queued goals are consumed in one cycle (`1-100`, default: all pending goals).
- `--wait-on-empty` + `--poll-seconds <n>` enables long-running poll mode for continuously appended program queues.
- `--max-cycles <n>` + `--max-minutes <n>` bound controller runtime to prevent unbounded loops.
- Controller lease lock is enabled by default to prevent concurrent queue corruption (`--controller-lock-file`, `--controller-lock-ttl-seconds`, `--no-controller-lock`).
- `--stop-on-goal-failure` stops controller immediately on the first failed dequeued goal.
- `--controller-done-file` / `--controller-failed-file` append per-goal archive lines for downstream ops and replay.
- Controller summaries are persisted by default (`.sce/auto/close-loop-controller-sessions`); use `--controller-session-id`, `--controller-session-keep`, `--controller-session-older-than-days`, `--no-controller-session` as needed.
- `--controller-print-program-summary` prints each nested program summary in realtime during controller execution.
- Supports full program governance/gate/recovery policy controls (`--program-*`, `--batch-*`, `--continue-on-error`, `--recovery-memory-scope`, `--dry-run`, `--json`).
- Output summary includes `history`, `results`, final `pending_goals`, `stop_reason`, `exhausted`, dedupe/lock/session, and resume-source telemetry.

Close-loop recovery command:
- Command: `sce auto close-loop-recover [summary]` (defaults to `latest` if summary is omitted).
- Loads unresolved goals from a prior summary and applies selected remediation strategy patch automatically.
- `--use-action <n>` chooses which remediation action to execute.
- `--recover-until-complete` + `--recover-max-rounds` enables self-healing multi-round recovery until convergence.
- `--recover-max-minutes <n>` bounds elapsed recovery duration.
- `--recovery-memory-ttl-days <n>` prunes stale memory before automatic action selection.
- `--recovery-memory-scope <scope>` isolates remediation memory by scope (default auto: project + git branch).
- `--spec-session-keep <n>` + `--spec-session-older-than-days <n>` enable automatic spec-directory retention after run.
- `--no-spec-session-protect-active` disables active/recent spec protection during automatic retention prune.
- `--spec-session-protect-window-days <n>` tunes how long recent session references protect specs from pruning.
- `--spec-session-max-total <n>` + `--spec-session-budget-hard-fail` add optional spec-count budget governance for autonomous recovery loops.
- `--program-gate-profile <profile>` + `--program-gate-fallback-*` + `--program-min-success-rate` + `--program-max-risk-level` + `--program-max-*` make recovery use the same convergence/budget gate strategy as program mode.
- `--no-program-gate-auto-remediate` disables automatic remediation patch/prune hints after recovery gate failure.
- When `--use-action` is omitted, sce can auto-select action from learned recovery memory.
- `--program-audit-out <path>` exports full recovery/program audit JSON.
- Output includes `recovered_from_summary`, `recovery_plan` (including `selection_explain`), `recovery_cycle` (with elapsed/budget metadata), and `recovery_memory` (including scope + selection explanation) for full auditability of applied strategy changes.

Program governance loop (for `close-loop-program`):
- `--program-govern-until-stable` enables bounded post-run governance rounds.
- `--program-govern-max-rounds <n>` and `--program-govern-max-minutes <n>` bound governance loop cost.
- `--program-govern-anomaly-weeks <n>` + `--program-govern-anomaly-period <week|day>` make governance anomaly-aware using autonomous KPI trend.
- `--no-program-govern-anomaly` limits governance trigger to gate/budget failures only.
- `--program-govern-use-action <n>` pins remediation action index for governance rounds.
- `--no-program-govern-auto-action` disables automatic remediation action selection/execution inside governance.
- Output includes `program_governance`, `program_kpi_trend`, and `program_kpi_anomalies` for traceable autonomous stabilization history.

KPI trend command:
- `sce auto kpi trend --weeks <n> --mode <all|batch|program|recover|controller> --period <week|day> --json` aggregates periodic success/completion, failure, sub-spec, and spec-growth telemetry from persisted autonomous session summaries.
- Add `--csv` to print/export trend buckets as CSV (`--out` writes CSV when `--csv` is enabled).
- JSON output now includes `mode_breakdown` (batch/program/recover/controller/other distribution), `anomaly_detection`, and `anomalies` for latest-period regression signals (success-rate drop, failed-goal spike, spec-growth spike).

### Create and Run a Feature Autonomously

```bash
# Create a new Spec and execute it autonomously
sce auto create "user authentication with JWT tokens"
```

This single command will:
1. Generate requirements.md with acceptance criteria
2. Generate design.md with architecture and components
3. Generate tasks.md with implementation plan
4. Execute all tasks continuously
5. Handle errors automatically
6. Create checkpoints at phase boundaries
7. Deliver the complete feature

### Run an Existing Spec

```bash
# Run an existing Spec autonomously
sce auto run 33-00-ai-autonomous-control
```

### Check Status

```bash
# View current execution status
sce auto status
```

### Resume After Pause

```bash
# Resume from last checkpoint
sce auto resume
```

### Stop Execution

```bash
# Gracefully stop and save state
sce auto stop
```

## Execution Modes

### Conservative Mode

**Best for**: Production features, critical systems, first-time users

**Behavior**:
- Creates checkpoints after each major phase
- Requests user approval at phase boundaries
- More cautious error recovery
- Detailed logging

**Configuration**:
```json
{
  "mode": "conservative",
  "checkpoints": {
    "requirementsReview": true,
    "designReview": true,
    "phaseCompletion": true,
    "finalReview": true
  }
}
```

### Balanced Mode

**Best for**: Most development scenarios

**Behavior**:
- Creates checkpoints at phase completions
- Requests approval for major decisions
- Standard error recovery
- Balanced logging

**Configuration**:
```json
{
  "mode": "balanced",
  "checkpoints": {
    "requirementsReview": false,
    "designReview": false,
    "phaseCompletion": true,
    "finalReview": true
  }
}
```

### Aggressive Mode (Default)

**Best for**: Rapid prototyping, experimental features, experienced users

**Behavior**:
- Minimal checkpoints (only on fatal errors)
- No approval requests
- Aggressive error recovery
- Minimal logging

**Configuration**:
```json
{
  "mode": "aggressive",
  "checkpoints": {
    "requirementsReview": false,
    "designReview": false,
    "phaseCompletion": false,
    "finalReview": false
  }
}
```

## Configuration

### Global Configuration

Location: `.sce/auto/config.json`

```json
{
  "version": "1.0.0",
  "mode": "aggressive",
  "checkpoints": {
    "requirementsReview": false,
    "designReview": false,
    "tasksReview": false,
    "phaseCompletion": false,
    "finalReview": false,
    "errorThreshold": 3
  },
  "errorRecovery": {
    "enabled": true,
    "maxAttempts": 3,
    "strategies": ["syntax-fix", "import-resolution", "type-correction", "null-check", "error-handling"],
    "learningEnabled": true
  },
  "safety": {
    "requireProductionConfirmation": false,
    "requireExternalResourceConfirmation": false,
    "requireDestructiveOperationConfirmation": false,
    "allowedOperations": [],
    "blockedOperations": []
  },
  "performance": {
    "maxConcurrentTasks": 1,
    "taskTimeout": 300000,
    "checkpointInterval": 600000
  }
}
```

### Per-Spec Configuration

Location: `.sce/specs/{spec-name}/auto-config.json`

Per-spec configuration overrides global settings.

### Manage Configuration

```bash
# View current configuration
sce auto config

# Set mode
sce auto config --mode aggressive

# Enable/disable checkpoints
sce auto config --checkpoint phaseCompletion=false

# Set error recovery attempts
sce auto config --error-recovery maxAttempts=5
```

## Error Recovery

### Automatic Recovery Strategies

1. **Syntax Fix**: Parse error messages and fix syntax issues
2. **Import Resolution**: Add missing imports, fix module paths
3. **Type Correction**: Fix type mismatches and add type annotations
4. **Null Check**: Add null/undefined checks
5. **Error Handling**: Wrap code in try-catch blocks

### Recovery Process

1. **Error Detection**: Error encountered during task execution
2. **Error Analysis**: Classify error type and severity
3. **Strategy Selection**: Choose best recovery strategy (learned from history)
4. **Apply Fix**: Implement the fix
5. **Validation**: Re-run tests to verify fix
6. **Retry or Pause**: If successful, continue; if failed after 3 attempts, pause

### Learning System

The error recovery system learns from experience:
- **Success History**: Tracks which strategies work for each error type
- **Failure History**: Tracks which strategies fail
- **Strategy Prioritization**: Prioritizes strategies with higher success rates
- **Continuous Improvement**: Gets better over time

## Checkpoints and Rollback

### Checkpoint Types

- **Requirements Complete**: After requirements.md generated
- **Design Complete**: After design.md generated
- **Tasks Complete**: After tasks.md generated
- **Phase Complete**: After each major phase (implementation, QA)
- **Fatal Error**: When unrecoverable error occurs
- **External Resource Needed**: When API keys or credentials required
- **Final Review**: Before marking Spec complete

### Rollback

```bash
# List available checkpoints
sce auto checkpoints

# Rollback to specific checkpoint
sce auto rollback <checkpoint-id>

# Rollback to last checkpoint
sce auto rollback --last
```

**What Gets Rolled Back**:
- File modifications
- Task queue state
- Progress tracking
- Execution log (preserved for audit)

## Safety Boundaries

### Automatic Safety Checks

1. **Production Environment**: Requires confirmation before modifying production
2. **Workspace Boundary**: Blocks operations outside workspace directory
3. **External Access**: Requires confirmation for API calls and network requests
4. **Destructive Operations**: Requires confirmation for file deletion, database drops

### Override Safety Checks

```bash
# Allow specific operation
sce auto config --safety allowedOperations=api-call,network-request

# Block specific operation
sce auto config --safety blockedOperations=delete-file,drop-database
```

## Progress Tracking

### Real-Time Status

```bash
sce auto status
```

**Output**:
```
Autonomous Execution Status
===========================

Spec: 33-00-ai-autonomous-control
Mode: balanced
Status: Running

Progress: 65%
Phase: implementation
Current Task: 9.6 Implement continuous task execution

Tasks: 12/18 completed (6 remaining)
Errors: 2 encountered, 2 resolved (100% recovery rate)

Started: 2026-02-02T10:30:00Z
Estimated Completion: 2026-02-02T11:45:00Z

Recent Actions:
  ✅ 10:45:23 - Task 9.5 completed
  ✅ 10:44:15 - Error recovered (strategy: import-resolution)
  ❌ 10:44:10 - Error encountered: Cannot find module 'fs-extra'
  ✅ 10:42:30 - Task 9.4 completed
  ✅ 10:40:15 - Task 9.3 completed
```

### Detailed Report

```bash
# Generate detailed report
sce auto report --format markdown --output report.md
sce auto report --format json --output report.json
```

## Best Practices

### When to Use Autonomous Mode

**✅ Good Use Cases**:
- Implementing well-defined features
- Creating new Specs from clear requirements
- Repetitive implementation tasks
- Prototyping and experimentation
- Batch processing multiple similar tasks

**❌ Not Recommended**:
- Unclear or ambiguous requirements
- Complex architectural decisions requiring human judgment
- Features requiring external resources you don't have
- Critical production changes without review

### Optimizing Autonomous Execution

1. **Clear Feature Descriptions**: Provide detailed, specific feature descriptions
2. **Choose Right Mode**: Use conservative for critical features, aggressive for prototypes
3. **Monitor Progress**: Check status periodically
4. **Review Checkpoints**: Review and approve at checkpoint boundaries
5. **Learn from History**: Let the system learn from multiple executions

### Handling Interruptions

**Graceful Stop**:
```bash
# Stop and save state
sce auto stop
```

**Emergency Stop** (Ctrl+C):
- State automatically saved
- Can resume from last checkpoint
- No data loss

**Resume**:
```bash
# Resume from where you left off
sce auto resume
```

## Troubleshooting

### Execution Stuck

**Symptom**: Progress not advancing

**Solutions**:
1. Check status: `sce auto status`
2. Review recent actions for errors
3. Check if waiting for user input
4. Stop and resume: `sce auto stop && sce auto resume`

### Repeated Errors

**Symptom**: Same error occurring multiple times

**Solutions**:
1. Review error in execution log
2. Check if error is environmental (missing dependencies, permissions)
3. Manually fix the issue
4. Resume execution

### Checkpoint Not Created

**Symptom**: Expected checkpoint not appearing

**Solutions**:
1. Check mode configuration
2. Verify checkpoint settings: `sce auto config`
3. Ensure phase actually completed

### Rollback Failed

**Symptom**: Cannot rollback to checkpoint

**Solutions**:
1. Check if checkpoint exists: `sce auto checkpoints`
2. Verify no external file modifications
3. Try earlier checkpoint
4. Manual recovery if needed

## Advanced Usage

### Custom Recovery Strategies

```javascript
// In your project's .sce/auto/custom-strategies.js
module.exports = {
  'custom-fix': async (error, context) => {
    // Your custom recovery logic
    return {
      success: true,
      action: 'custom-action',
      details: 'Applied custom fix'
    };
  }
};
```

### Integration with CI/CD

```yaml
# .github/workflows/autonomous-feature.yml
name: Autonomous Feature Development

on:
  issues:
    types: [labeled]

jobs:
  develop:
    if: github.event.label.name == 'auto-implement'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install sce
        run: npm install -g scene-capability-engine
      - name: Create feature autonomously
        run: sce auto create "${{ github.event.issue.title }}"
      - name: Create pull request
        uses: peter-evans/create-pull-request@v4
```

### Monitoring and Alerts

```bash
# Enable notifications
sce auto config --notifications enabled=true onError=true onCompletion=true

# Export logs for monitoring
sce auto report --format json | jq '.errors'
```

## FAQ

**Q: How long does autonomous execution take?**
A: Depends on feature complexity. Simple features: 5-15 minutes. Complex features: 30-60 minutes. The system provides real-time estimates.

**Q: Can I interrupt autonomous execution?**
A: Yes, use `sce auto stop` or Ctrl+C. State is saved and you can resume later.

**Q: What happens if my computer crashes during execution?**
A: State is saved periodically. Resume from last checkpoint with `sce auto resume`.

**Q: How accurate is error recovery?**
A: Improves over time. Initial success rate ~60-70%, improves to ~85-90% with learning.

**Q: Can I review changes before they're applied?**
A: Yes, use conservative mode with checkpoint reviews enabled.

**Q: Does autonomous mode work with existing Specs?**
A: Yes, use `sce auto run <spec-name>` to execute existing Specs autonomously.

**Q: How do I disable autonomous mode?**
A: Simply don't use `sce auto` commands. Use regular `sce` commands for interactive mode.

## See Also

- [Spec Workflow Guide](./spec-workflow.md)
- [Testing Strategy](./testing-strategy.md)
- [CORE_PRINCIPLES](./.sce/steering/CORE_PRINCIPLES.md)
- [Command Reference](./command-reference.md)
