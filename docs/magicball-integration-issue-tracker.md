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
- `device current`
- `app bundle` registry local state and CLI
- `app collection list/show/apply`
- `scene workspace list/show/apply`
- `app install-state list`
- `mode application home --app ... --json`
- `mode ontology home --app ... --json`
- `mode engineering home --app ... --json`
- `scene delivery show`
- `app registry status/configure/sync*`
- `app runtime show/releases/install/activate/uninstall`
- `app engineering preview/ownership/open/import/show/attach/hydrate/scaffold/activate`
- `project portfolio show/target resolve/supervision show`
- `pm requirement/tracking/planning/change/issue` data plane
- `ontology er/br/dl` + `ontology triad summary`
- `ontology seed list/show/apply`
- `assurance resource/logs/backup/config`
- MagicBall-facing docs updated under `docs/`

### Current recommended MagicBall consumption order
1. consume `mode * home` as the top-level source for the three modes
2. consume `device current`, `app collection list/show/apply`, `scene workspace list/show/apply`, and `app install-state list` as the local device/install baseline
3. consume `pm`, `ontology`, and `assurance` table payloads
4. wire runtime install/activate/uninstall and engineering attach/hydrate/scaffold/activate actions
5. treat `project portfolio / target resolve / supervision` as the default multi-project shell truth
6. use demo app: `customer-order-demo`

### Related SCE docs
- `docs/magicball-sce-adaptation-guide.md`
- `docs/magicball-write-auth-adaptation-guide.md`
- `docs/magicball-adaptation-task-checklist-v1.md`
- `docs/magicball-mode-home-and-ontology-empty-state-playbook.md`
- `docs/magicball-engineering-projection-contract.md`
- `docs/magicball-project-portfolio-contract.md`
- `docs/magicball-frontend-state-and-command-mapping.md`
- `docs/magicball-ui-surface-checklist.md`
- `docs/magicball-integration-doc-index.md`
- `docs/magicball-cli-invocation-examples.md`
- these docs now explicitly capture:
  - current entry docs vs secondary references vs historical drafts are now separated in `docs/magicball-integration-doc-index.md`
  - serialized `mode * home` loading as the safe default during `Issue 001` verification
  - `fallback + optional seed apply` as the recommended default for fresh-project ontology UX under `Issue 003`
  - multi-project roster / routing / supervision contract is now captured in `docs/magicball-project-portfolio-contract.md`

### Next Needed From MagicBall
1. treat the current doc set as stable and move into feedback-driven integration using the current entry docs
2. continue real integration against `customer-order-demo` for all three `mode * home` pages
3. keep `mode home` requests serialized during current verification window
4. keep fresh-ontology UX on `fallback + optional seed apply`:
   - MagicBall local UI now renders starter seed guidance + preview + explicit apply
   - `ontology seed apply` is wired through shared write auth using scope `ontology:seed:apply`
   - keep this item open only for wider field verification, not for strategy selection
5. if any new integration mismatch appears, record it in `Open Items` with:
   - exact command
   - workspace path
   - current payload
   - expected payload
   - UI impact

### Cross-project decision recorded
- The next install-management phase should not use a single global install set.
- SCE will separate shared app intent from local device installation facts.
- Planned phase-1 capability is documented in `docs/magicball-app-collection-phase-1.md`.

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
- `sce scene delivery show --scene scene.customer-order-demo --json`
- `sce app engineering preview --app customer-order-demo --json`
- `sce app engineering ownership --app customer-order-demo --json`

MagicBall action taken:
- Changed mode-home loading from parallel to sequential in local store.
- MagicBall now serializes:
  1. application home
  2. ontology home
  3. engineering home
  4. scene delivery show
  5. engineering preview
  6. engineering ownership

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
- empty-ontology flow reverified locally on 2026-03-08 in `E:\workspace\331-poc\tmp\sce-empty-ontology-repro`
- local verification covered: `triad summary` empty -> `seed list/show` preview -> `seed apply` -> `triad summary` ready
- keep open until broader field verification confirms the UX is stable

### Issue 006: scene-profile and app-collection install orchestration is not yet command-ready

Context:
- MagicBall now needs a scene-oriented install-management model above current per-app runtime controls.
- Current SCE already supports per-app runtime install, activate, uninstall, but not shared app intent vs device fact resolution.

Cross-project decision:
- Do not model this as one global install set shared blindly across devices.
- Separate:
  - shared intent: `app_collection`, `scene_profile`
  - local fact: `device_installation`
  - local override: `device_override`
- Keep shared intent file-backed or registry-backed.
- Use SQLite only for local facts and rebuildable projections.
- `apply` must be plan-first and require explicit execution confirmation.

Reference:
- `docs/magicball-app-collection-phase-1.md`
- `.sce/specs/128-00-app-collection-scene-profile-device-installation/`

Status:
- architecture decision aligned
- spec added in SCE
- read-model and plan-first diff commands implemented
- explicit execute path now implemented for non-blocked install/uninstall actions
- execute remains blocked when unresolved collections, missing app bundles, or active-release protection skips are present
- local `device_override` file is now respected during resolution, so per-device add/remove exceptions no longer require mutating shared intent definitions
- local `device_override` now also has explicit `show/upsert` command support, so frontend or operator flows no longer need to hand-edit the override file

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
### Verification 002: pm requirement/tracking/planning/change/issue round-trip works in current `331-poc`

Observed result:
- local repro on 2026-03-08 shows `requirement`, `tracking`, `planning`, `change`, and `issue` writes all appear on immediate follow-up list/board reads
- this revalidation was executed in `E:\workspace\331-poc`
- write payloads used current SCE-required minimal fields rather than older placeholder payloads

Implication for MagicBall:
- keep optimistic local UI fallback as a defensive strategy
- but current local evidence no longer shows stale read-after-write behavior for these PM objects

Status:
- verified working in current local context

