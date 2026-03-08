# MagicBall Integration Issue Tracker

> This file is the narrow coordination document between MagicBall and SCE.
> It is used to record only the minimum integration facts that require cross-project synchronization: active issues, contract gaps, decisions, and verification results.
> When SCE completes a relevant change that MagicBall needs to know about, the update should be synced here.
> Once an item is verified and no longer needs cross-project coordination, it should be removed or compacted to avoid the file becoming too large, too noisy, or too hard to maintain.

## Usage Rule

- Keep this file narrow.
- Add only cross-project integration facts.
- Prefer short status-oriented records over long design discussion.
- Move completed items to `Resolved` or remove them once both sides no longer need them.

## Current Contract

### Current SCE capabilities ready for MagicBall integration

SCE changes completed and now available for MagicBall:
- `app bundle` registry local state and CLI
- `mode application home --app ... --json`
- `mode ontology home --app ... --json`
- `mode engineering home --app ... --json`
- `app registry status/configure/sync*`
- `app runtime show/releases/install/activate`
- `app engineering show/attach/hydrate/activate`
- `pm requirement/tracking/planning/change/issue` data plane
- `ontology er/br/dl` + `ontology triad summary`
- `ontology seed list/show/apply`
- `assurance resource/logs/backup/config`
- MagicBall-facing docs updated under `docs/`

### Current recommended MagicBall consumption order
1. consume `mode * home` as the top-level source for the three modes
2. consume `pm`, `ontology`, and `assurance` table payloads
3. wire runtime install/activate and engineering attach/hydrate/activate actions
4. use demo app: `customer-order-demo`

### Related SCE docs
- `docs/magicball-sce-adaptation-guide.md`
- `docs/magicball-write-auth-adaptation-guide.md`
- `docs/magicball-adaptation-task-checklist-v1.md`
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-ui-surface-checklist.md`
- `docs/magicball-integration-doc-index.md`
- these docs now explicitly capture:
  - serialized `mode * home` loading as the safe default during `Issue 001` verification
  - `fallback + optional seed apply` as the recommended default for fresh-project ontology UX under `Issue 003`

### Next Needed From MagicBall
1. continue real integration against `customer-order-demo` for all three `mode * home` pages
2. keep `mode home` requests serialized during current verification window
3. keep fresh-ontology UX on `fallback + optional seed apply`:
   - MagicBall local UI now renders starter seed guidance + preview + explicit apply
   - `ontology seed apply` is wired through shared write auth using scope `ontology:seed:apply`
   - keep this item open only for wider field verification, not for strategy selection
4. if any new integration mismatch appears, record it in `Open Items` with:
   - exact command
   - workspace path
   - current payload
   - expected payload
   - UI impact

## Open Items

### Issue 001: SQLite lock when frontend triggers multiple SCE projection commands concurrently

Context:
- Project: `E:\workspace\331-poc`
- Upstream docs referenced from: `E:\workspace\kiro-spec-engine\docs`
- SCE local source version observed: `3.6.34`

Observed behavior:
- When multiple `sce mode ... home --json` commands are triggered concurrently, frontend occasionally receives:
  - `database is locked`

Concrete command involved:
- `sce mode application home --app customer-order-demo --json`

Related commands that were being loaded together:
- `sce mode application home --app customer-order-demo --json`
- `sce mode ontology home --app customer-order-demo --json`
- `sce mode engineering home --app customer-order-demo --json`
- `sce app engineering show --app customer-order-demo --json`

MagicBall action taken:
- Changed mode-home loading from parallel to sequential in local store.
- MagicBall now serializes:
  1. application home
  2. ontology home
  3. engineering home
  4. engineering show

SCE action taken:
- Added short read retry handling for retryable sqlite lock errors on app/mode/pm/ontology/assurance read paths.
- Added short-lived `mode home` projection cache to reduce repeated reads for the same app/projection in a short window.
- Goal: reduce transient `database is locked` failures for read-heavy MagicBall integration flows.

Current cross-project decision:
- Keep sequential frontend loading as the current safe default.
- Treat SCE read retry + projection cache as mitigation, not as permission to switch back to parallel loading immediately.

Status:
- MagicBall workaround applied
- SCE mitigation applied
- still needs wider real-world verification before considering this fully closed

### Issue 003: ontology ER/BR/DL data planes are command-ready but currently empty by default

Context:
- Project: `E:\workspace\331-poc`
- SCE source: `E:\workspace\kiro-spec-engine`
- Commands verified:
  - `npx sce ontology er list --json`
  - `npx sce ontology br list --json`
  - `npx sce ontology dl list --json`
  - `npx sce ontology triad summary --json`

Observed behavior:
- ER/BR/DL list commands are stable and return table payloads with `view_model.columns`
- but all three currently return empty item arrays in the default local state
- triad summary returns valid shape but zero coverage / all triads missing unless MagicBall applies fallback or the project creates real ontology assets

Impact on MagicBall:
- frontend can safely wire read flows now
- but user-visible ontology pages need either sample fallback, a create flow, or starter seed data to avoid blank pages in fresh projects
- triad completeness currently depends on newly created assets or fallback data

Current cross-project decision:
- treat empty ontology state as expected for fresh/local projects
- SCE now provides built-in starter seed support for `customer-order-demo`
- `ontology triad summary` and `mode ontology home` now also return `starter_seed` guidance when ontology is empty
- MagicBall local UI now uses `fallback + optional seed apply` as the default policy
- starter seed preview is driven by `sce ontology seed list/show --json`
- explicit initialization is driven by `sce ontology seed apply --profile <profile> --auth-lease <lease-id> --json`

Relevant commands:
- `sce ontology seed list --json`
- `sce ontology seed show --profile customer-order-demo --json`
- `sce ontology seed apply --profile customer-order-demo --json`

Status:
- frontend read path ready
- ontology write/read loop already verified working
- starter seed support implemented in SCE
- payload-level `starter_seed` guidance implemented in SCE
- MagicBall starter seed preview/apply UI implemented locally in `E:\workspace\331-poc\frontend\src\renderer\components\ontology\OntologyStarterSeedPanel.vue`
- keep open until broader field verification confirms the UX is stable

## Resolved

### Issue 002: pm requirement upsert succeeds but requirement list still returns empty

Resolution:
- Reproduced against current source and CLI smoke path.
- Current behavior is now correct.
- `pm requirement upsert` followed by `pm requirement list` returns the newly written item in the same workspace context.

Status:
- resolved on current SCE source
- keep closed unless MagicBall can reproduce with exact workspace path and command path

### Issue 004: pm tracking/issue upsert succeeds but board queries still return empty

Resolution:
- Reproduced against current source and CLI smoke path.
- Current behavior is now correct.
- `pm tracking upsert` followed by `pm tracking board` returns the newly written item in the same workspace context.
- `pm issue upsert` followed by `pm issue board` returns the newly written item in the same workspace context.

Status:
- resolved on current SCE source
- keep closed unless MagicBall can reproduce with exact workspace path and command path

### Issue 005: pm planning/change list results lag after upsert and can hide the newest local row

Resolution:
- Reproduced against current source and CLI smoke path.
- Current behavior is now correct.
- `pm planning upsert` followed by `pm planning board` returns the newest row first.
- `pm change upsert` followed by `pm change list` returns the newest row first.

Status:
- resolved on current SCE source
- keep closed unless MagicBall can reproduce with exact workspace path, input payloads, and command path

### Verification 001: ontology ER/BR/DL upsert + list round-trip works in current SCE

Observed result:
- all three upsert commands return `success: true`
- all three corresponding list commands immediately show the inserted item

Implication for MagicBall:
- ontology ER/BR/DL minimal write forms can rely on post-save refresh
- optimistic fallback is optional for ontology write/read loops

Status:
- verified working

