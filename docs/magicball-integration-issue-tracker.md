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

### Next Needed From MagicBall
1. continue real integration against `customer-order-demo` for all three `mode * home` pages
2. keep `mode home` requests serialized during current verification window
3. decide fresh-ontology UX strategy for `Issue 003`:
   - frontend fallback only
   - `ontology seed apply` only
   - fallback + optional seed apply
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
- Goal: reduce transient `database is locked` failures for read-heavy MagicBall integration flows.

Current cross-project decision:
- Keep sequential frontend loading as the current safe default.
- Treat SCE read retry as mitigation, not as permission to switch back to parallel loading immediately.

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
- MagicBall still needs to decide whether to use frontend fallback, starter seed apply, or both

Relevant commands:
- `sce ontology seed list --json`
- `sce ontology seed show --profile customer-order-demo --json`
- `sce ontology seed apply --profile customer-order-demo --json`

Status:
- frontend read path ready
- ontology write/read loop already verified working
- starter seed support implemented in SCE
- fallback/startup UX decision still open on MagicBall side

## Resolved

### SCE Update 001: Current capabilities ready for MagicBall integration

Status:
- ready for MagicBall integration
- moved into `Current Contract`

### Issue 002: pm requirement upsert succeeds but requirement list still returns empty

Resolution:
- Reproduced against current source and CLI smoke path.
- Current behavior is now correct.
- `pm requirement upsert` followed by `pm requirement list` returns the newly written item in the same workspace context.

Verification summary:
1. wrote `REQ-TEST-001` through `sce pm requirement upsert --json`
2. immediately executed `sce pm requirement list --json`
3. result returned:
   - `summary.total = 1`
   - `items[0].requirement_id = REQ-TEST-001`

Status:
- resolved on current SCE source
- keep closed unless MagicBall can reproduce with exact workspace path and command path

### Issue 004: pm tracking/issue upsert succeeds but board queries still return empty

Resolution:
- Reproduced against current source and CLI smoke path.
- Current behavior is now correct.
- `pm tracking upsert` followed by `pm tracking board` returns the newly written item in the same workspace context.
- `pm issue upsert` followed by `pm issue board` returns the newly written item in the same workspace context.

Verification summary:
1. wrote `TRK-TEST-001` through `sce pm tracking upsert --json`
2. immediately executed `sce pm tracking board --json`
3. result returned:
   - `summary.total = 1`
   - `items[0].tracking_id = TRK-TEST-001`
4. wrote `BUG-TEST-001` through `sce pm issue upsert --json`
5. immediately executed `sce pm issue board --json`
6. result returned:
   - `summary.total = 1`
   - `items[0].issue_id = BUG-TEST-001`

Status:
- resolved on current SCE source
- keep closed unless MagicBall can reproduce with exact workspace path and command path

### Verification 001: ontology ER/BR/DL upsert + list round-trip works in current SCE

Verified commands:
- `npx sce ontology er upsert --input .sce\\state\\mb-er-upsert-test.json --json`
- `npx sce ontology br upsert --input .sce\\state\\mb-br-upsert-test.json --json`
- `npx sce ontology dl upsert --input .sce\\state\\mb-dl-upsert-test.json --json`
- `npx sce ontology er list --json`
- `npx sce ontology br list --json`
- `npx sce ontology dl list --json`

Observed result:
- all three upsert commands return `success: true`
- all three corresponding list commands immediately show the inserted item

Implication for MagicBall:
- ontology ER/BR/DL minimal write forms can rely on post-save refresh
- optimistic fallback is optional for ontology write/read loops

Status:
- verified working
