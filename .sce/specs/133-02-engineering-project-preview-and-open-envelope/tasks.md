# Tasks Document

## T1 Define preview payload
- [ ] Define canonical preview fields and readiness flags
- [ ] Define `sourceKnown` vs `projectionReady`

## T2 Define open/import result envelope
- [ ] Define ordered step schema for `register`, `attach`, `hydrate`, `activate`
- [ ] Define status enum and reason-code reuse rules

## T3 Bind to existing engineering semantics
- [ ] Map the envelope to existing `app engineering` behaviors
- [ ] Keep compatibility with current attach/hydrate/activate command flows
