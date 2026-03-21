# Design Document

## Decision

Treat `137-00` as the umbrella contract and introduce one rollout program for actual implementation.

This avoids the common failure mode where a large runtime-integration spec mixes:

- tool contracts
- transport binding debates
- project routing
- write authorization
- supervision projection
- adapter examples

in one pass.

## Child Spec Topology

Phase-1 child specs:

1. `140-01` canonical tool surface and session envelope
2. `140-02` lease-aware write guard and project routing
3. `140-03` occupancy and supervision projection

## Program Rules

- `137-00` remains the umbrella direction spec
- `140-00` is the rollout/control spec
- child specs must stay implementation-sized
- vendor examples remain examples, not engine protocol

## Deferrals

Deferred beyond phase-1:

- richer MCP transport conveniences
- vendor-specific helper adapters
- broader orchestration automation
- UI-specific embedding workflow
