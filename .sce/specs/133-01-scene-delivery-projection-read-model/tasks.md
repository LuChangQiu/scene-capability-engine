# Tasks Document

## T1 Define delivery projection envelope
- [ ] Define the canonical phase-1 envelope for `overview`, `documents`, `checklists`, `handoffs`, `releases`, and `acceptance`
- [ ] Define per-record base fields and scope linkage fields

## T2 Define phase-1 source mapping
- [ ] Map canonical engine sources versus linked-evidence sources
- [ ] Mark which ids are canonical now and which are provisional

## T3 Define command surface
- [ ] Specify `sce scene delivery show --scene <scene-id> [--spec <spec-id>] --json`
- [ ] Specify JSON response contract and error semantics

## T4 Protect phase-1 boundaries
- [ ] Keep phase-1 read-only / read-heavy
- [ ] Preserve compatibility with existing scene execution and release evidence flows
