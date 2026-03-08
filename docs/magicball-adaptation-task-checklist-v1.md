# MagicBall Adaptation Task Checklist v1

## Goal

Turn the current SCE capability set into a concrete MagicBall adaptation checklist.

This checklist is meant for:
- frontend implementation
- integration sequencing
- joint verification between MagicBall and SCE

## Scope

Current checklist covers:
1. app selection and mode switching
2. application mode adaptation
3. ontology mode adaptation
4. engineering mode adaptation
5. write authorization handling
6. demo app verification

## Phase 1: App Entry And Mode Switching

### Task 1.1
Use `app_key` as the frontend route token.

Recommended value:
- `customer-order-demo`

### Task 1.2
When an app is selected, request:
```bash
sce app bundle show --app customer-order-demo --json
```

Use this to cache:
- `app_id`
- `app_key`
- `app_name`
- `runtime_release_id`
- `ontology_bundle_id`
- `engineering_project_id`
- `default_scene_id`

### Task 1.3
Replace mode-local reconstruction with mode projection calls.

Required commands:
```bash
sce mode application home --app customer-order-demo --json
sce mode ontology home --app customer-order-demo --json
sce mode engineering home --app customer-order-demo --json
```

Done when:
- all three mode entry pages are driven by these commands
- frontend no longer reconstructs runtime/ontology/engineering binding itself

## Phase 2: Application Mode

### Task 2.1
Render application mode hero from:
```bash
sce mode application home --app customer-order-demo --json
```

Important fields:
- `summary.app_name`
- `summary.runtime_version`
- `summary.install_status`
- `summary.release_count`
- `view_model.current_release`
- `view_model.entrypoint`
- `view_model.install_root`

### Task 2.2
Render release list from:
```bash
sce app runtime releases --app customer-order-demo --json
```

Expected UI:
- release table/list
- active/default release marker
- runtime version
- release status
- entrypoint

### Task 2.3
Wire install action.

Command:
```bash
sce app runtime install --app customer-order-demo --release <release-id> --json
```

Done when:
- clicking install executes command
- result updates local runtime section
- install root is shown in UI

### Task 2.4
Wire activate action.

Command:
```bash
sce app runtime activate --app customer-order-demo --release <release-id> --json
```

Done when:
- active release changes in UI
- `mode application home` reflects the new active release after refresh

## Phase 3: Ontology Mode

### Task 3.1
Render ontology home summary from:
```bash
sce mode ontology home --app customer-order-demo --json
```

Important fields:
- `summary.ontology_version`
- `summary.template_version`
- `summary.triad_status`
- `summary.publish_readiness`
- `summary.triad_coverage_percent`
- `ontology_core_ui`
- `view_model.triad_summary`

### Task 3.2
Render ER table from:
```bash
sce ontology er list --json
```

Use:
- `items`
- `view_model.columns`
- `mb_status`

### Task 3.3
Render BR table from:
```bash
sce ontology br list --json
```

### Task 3.4
Render DL table from:
```bash
sce ontology dl list --json
```

### Task 3.5
Use triad summary card from:
```bash
sce ontology triad summary --json
```

Done when:
- MagicBall no longer calculates triad completeness itself
- `ontology_core_ui` is used directly for completeness and missing-triad display

## Phase 4: Engineering Mode

### Task 4.1
Render engineering home summary from:
```bash
sce mode engineering home --app customer-order-demo --json
```

Important fields:
- `summary.code_version`
- `summary.current_branch`
- `summary.requirement_count`
- `summary.issue_count`
- `summary.plan_count`
- `summary.assurance_resource_count`
- `view_model.delivery_summary`
- `view_model.assurance_summary`

### Task 4.2
Render delivery tabs from real SCE data.

Commands:
```bash
sce pm requirement list --json
sce pm tracking board --json
sce pm planning board --json
sce pm change list --json
sce pm issue board --json
```

Done when:
- all five delivery tabs read SCE JSON
- all five tabs use `view_model.columns`
- fallback markdown becomes empty-state only

### Task 4.3
Render assurance tabs from real SCE data.

Commands:
```bash
sce assurance resource status --json
sce assurance logs views --json
sce assurance backup list --json
sce assurance config switches --json
```

Done when:
- all four assurance tabs read SCE JSON
- table rendering uses `view_model.columns`
- empty-state fallback remains optional only

### Task 4.4
Wire engineering workspace flow.

Commands:
```bash
sce app engineering show --app customer-order-demo --json
sce app engineering attach --app customer-order-demo --repo <repo-url> --branch main --json
sce app engineering hydrate --app customer-order-demo --json
sce app engineering activate --app customer-order-demo --json
```

Done when:
- MagicBall can detect attached/not-attached state
- MagicBall can trigger attach/hydrate/activate
- active engineering workspace path is shown in UI

## Phase 5: Write Authorization

### Task 5.1
Implement shared lease state in frontend.

Commands:
```bash
sce auth status --json
sce auth status --lease <lease-id> --json
```

### Task 5.2
Implement shared auth prompt flow.

Command:
```bash
sce auth grant --scope <scope> --reason "<reason>" --json
```

### Task 5.3
Pass `--auth-lease` for all mutating commands.

Commands that matter now:
- `sce app bundle register`
- `sce app registry configure`
- `sce app engineering attach`
- `sce app engineering hydrate`
- `sce app engineering activate`
- `sce app runtime install`
- `sce app runtime activate`
- `sce pm * upsert`
- `sce ontology * upsert`

### Task 5.4
Handle auth failure separately from validation failure.

Done when:
- missing lease opens auth prompt
- invalid lease forces refresh and retry
- validation errors stay in-page and do not reopen auth flow

## Phase 6: Demo App Verification

### Task 6.1
Sync registries locally.

Commands:
```bash
sce app registry status --json
sce app registry sync --json
```

Done when:
- `customer-order-demo` appears in app selection

### Task 6.2
Run full demo path.

Verification path:
1. select `customer-order-demo`
2. load `application home`
3. load `ontology home`
4. load `engineering home`
5. show runtime releases
6. show PM delivery tables
7. show ontology ER/BR/DL tables
8. show assurance tables

### Task 6.3
Verify mode consistency.

Done when:
- the same app identity maps to all three modes
- `runtime_release_id`, `ontology_bundle_id`, and `engineering_project_id` stay aligned

## Recommended Priority Order

### Priority A
- Task 1.1
- Task 1.2
- Task 1.3
- Task 6.1

### Priority B
- Task 2.1
- Task 3.1
- Task 4.1

### Priority C
- Task 4.2
- Task 4.3
- Task 3.2
- Task 3.3
- Task 3.4
- Task 3.5

### Priority D
- Task 2.2
- Task 2.3
- Task 2.4
- Task 4.4
- Phase 5 tasks

## Minimum Definition Of Done

MagicBall can be considered adapted to the current SCE version when:

1. app selection uses `customer-order-demo`
2. all three mode entry pages read `mode * home`
3. Engineering Mode delivery tabs read `sce pm *`
4. Ontology Mode reads `sce ontology *`
5. Assurance tabs read `sce assurance *`
6. write actions pass `--auth-lease`
7. install / activate / attach / hydrate actions work from the UI

## Practical Conclusion

MagicBall should now stop waiting for more foundation work and move into concrete integration.

The best immediate implementation order is:
1. mode entry integration
2. engineering + ontology read-only tables
3. runtime release panel
4. write authorization flow
5. install/activate/attach/hydrate actions
