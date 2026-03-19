# Tasks Document

## T1 Define the resolution result
- [x] Lock the `ProjectTargetResolution` shape
- [x] Lock status states, reason codes, and candidate fields

## T2 Define the command
- [x] Lock `sce project target resolve --json`
- [x] Lock caller-context input semantics and unresolved/ambiguous behavior

## T3 Reuse the result in command receipts
- [x] Define how assistant and orchestration receipts echo the actual resolved project
- [x] Ensure routing does not implicitly mutate active workspace selection
