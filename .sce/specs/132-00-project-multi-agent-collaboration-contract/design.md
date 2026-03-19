# Design Document

## Design Summary

The engine contract is split into four sub-domains:

1. `132-01` session, scope lease, occupancy
2. `132-02` scheduler, dependency, handoff
3. `132-03` implementation runtime and worktree orchestration
4. `132-04` collaboration event and supervision projection

The contract remains tool-neutral:

- no IDE cards, panes, or tabs
- no CLI-only formatting
- semantic payloads only

## Key Boundary

SCE owns:

- session registry
- scope leases
- scheduler / handoff states
- implementation runtime bindings
- collaboration projections

Adapters own:

- layout
- filtering
- compact vs detailed views
- interaction affordances
