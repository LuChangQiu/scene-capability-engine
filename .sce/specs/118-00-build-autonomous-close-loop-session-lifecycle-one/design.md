# Design

## Requirement Mapping
- FR1 -> Portfolio decomposition engine + naming strategy
- FR2 -> Orchestrate runtime invocation with dependency-aware order
- FR3 -> Collaboration metadata synchronization (status + assignment)
- FR4 -> JSON result artifact and terminal summary

## Coordination Topology
- Master: `118-00-build-autonomous-close-loop-session-lifecycle-one`
- Sub: `118-01-closed-loop-autonomous-execution`
- Sub: `118-02-master-sub-spec-decomposition`
- Sub: `118-03-parallel-orchestration-runtime` (depends on: 118-01-closed-loop-autonomous-execution, 118-02-master-sub-spec-decomposition)

## Integration Contract
- All Sub Specs must be marked completed before the Master Spec can be completed.
- Blocked/failed Sub Specs propagate a blocked state to dependent Specs.
- Final result is published as a single orchestration report payload.
