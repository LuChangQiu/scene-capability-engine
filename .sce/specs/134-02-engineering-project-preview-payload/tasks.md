# Tasks Document

## T1 Define preview shape
- [x] Lock the `EngineeringProjectPreview` payload fields
- [x] Lock the readiness flag semantics

## T2 Define reason codes
- [x] Lock the non-ready reason-code set
- [x] Lock the mapping from readiness state to reason codes

## T3 Bind the existing preview path
- [x] Bind the canonical payload to `sce app engineering preview --app <app-id> --json`
- [x] Keep the path read-only
