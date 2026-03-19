# Tasks

### T1 Define engineering project preview contract
**Validates: Requirement 1, Requirement 3**

- [ ] Define canonical preview fields
- [ ] Define readiness flags and reason codes
- [ ] Document sourceKnown vs projectionReady semantics

### T2 Define onboarding result envelope
**Validates: Requirement 2, Requirement 6**

- [ ] Define open/import result schema
- [ ] Define canonical step status enum and reason-code model
- [ ] Document cross-tool neutrality boundary

### T3 Define scaffold contract
**Validates: Requirement 4**

- [ ] Define canonical scaffold command or service surface
- [ ] Define idempotent result schema and overwrite policy
- [ ] Require canonical workspacePath in scaffold result
- [ ] Replace current adapter-local fallback scaffold rules used by MagicBall IDE with engine-owned semantics

### T4 Define ownership relation extension point
**Validates: Requirement 5**

- [ ] Define app/workspace/user/device relation fields
- [ ] Document phased rollout without adapter-owned parallel registry
