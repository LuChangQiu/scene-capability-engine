# Agent Sync Plan

## Agent Topology
- `agent-master`: owns `118-00-build-autonomous-close-loop-session-lifecycle-one`
- `agent-sub-01`: owns `118-01-closed-loop-autonomous-execution` lease=`closed-loop`
- `agent-sub-02`: owns `118-02-master-sub-spec-decomposition` lease=`master-sub`
- `agent-sub-03`: owns `118-03-parallel-orchestration-runtime` lease=`parallel-orchestration`

## Dependency Cadence
- `118-01-closed-loop-autonomous-execution` can start immediately
- `118-02-master-sub-spec-decomposition` can start immediately
- `118-03-parallel-orchestration-runtime` starts after: 118-01-closed-loop-autonomous-execution, 118-02-master-sub-spec-decomposition

## Close-Loop Rules
1. Sub specs update collaboration status immediately after each milestone.
2. Master spec only transitions to completed when all subs are completed.
3. Any failed/blocked sub spec propagates blocked state to dependent specs.

## Scheduling Plan
- Auto reordered: no
- Sequence: 118-01-closed-loop-autonomous-execution -> 118-02-master-sub-spec-decomposition -> 118-03-parallel-orchestration-runtime
