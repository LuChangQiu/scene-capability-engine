# Route Layer Evidence

## Sample Command

- `sce scene route --query hybrid --mode dry_run`

## Observed Result

- Selected: `scene.hybrid.37-00-scene-runtime-execution-pilot`
- Suggested commands include validate/doctor/run with resolved spec + manifest.

## Notes

- Routing now bridges discovery (`scene catalog`) and execution entrypoints.
- Strict ambiguity mode is available via `--require-unique`.
