# MagicBall UI Surface Checklist

## Goal

Give MagicBall frontend a page-by-page checklist for the current SCE integration scope.

This is a short execution sheet.
It does not replace the main guides.

## 1. App Workspace Shell

### Required data
- `sce app bundle show --app <app-key> --json`
- `sce mode application home --app <app-key> --json`
- `sce mode ontology home --app <app-key> --json`
- `sce mode engineering home --app <app-key> --json`
- `sce app engineering show --app <app-key> --json`

### Required behavior
- bootstrap commands run sequentially
- shell becomes visible before all four steps complete
- each step has isolated retry
- exact command failure can be copied

### Done when
- app header renders from `app bundle show`
- three mode summaries render without frontend-side relationship reconstruction
- engineering detail failure does not crash the full workspace

## 2. Application Mode

### Required data
- `sce mode application home --app <app-key> --json`
- `sce app runtime releases --app <app-key> --json`

### Required UI
- app hero
- release list
- install status
- current release marker
- install / activate actions if enabled by product policy

### Done when
- release list uses SCE payload directly
- active release updates after refresh

## 3. Ontology Mode

### Required data
- `sce mode ontology home --app <app-key> --json`
- `sce ontology triad summary --json`
- `sce ontology er list --json`
- `sce ontology br list --json`
- `sce ontology dl list --json`

### Required UI
- ontology summary card
- triad summary card
- ER / BR / DL tables
- empty-state card when ontology is truly empty
- starter-seed guidance when provided by SCE

### Empty-state rules
- empty is expected for fresh/local projects
- empty state is not a backend failure state
- show `Initialize starter ontology`
- show `Continue with empty ontology`

### Done when
- empty ontology is explained clearly
- real ontology items hide the empty-state card
- summary and tables can fail independently without full page crash

## 4. Starter Seed Flow

### Required data
- `sce ontology seed show --profile customer-order-demo --json` optional
- `sce ontology seed apply --profile customer-order-demo --json`

### Required behavior
- user-triggered only
- confirmation before apply
- automatic refresh chain after success:
  1. `mode ontology home`
  2. `ontology triad summary`
  3. `ontology er list`
  4. `ontology br list`
  5. `ontology dl list`

### Done when
- seed success updates both summary cards and tables
- seed failure preserves exact command error and retry button

## 5. Engineering Mode

### Required data
- `sce mode engineering home --app <app-key> --json`
- `sce pm requirement list --json`
- `sce pm tracking board --json`
- `sce pm planning board --json`
- `sce pm change list --json`
- `sce pm issue board --json`
- `sce assurance resource status --json`
- `sce assurance logs views --json`
- `sce assurance backup list --json`
- `sce assurance config switches --json`

### Required UI
- delivery summary
- requirement / tracking / planning / change / issue tabs
- assurance tabs
- engineering workspace detail

### Done when
- all engineering tables use `items + view_model.columns`
- empty tables are rendered as empty states, not markdown fallbacks by default

## 6. Write Authorization

### Required data
- `sce auth status --json`
- `sce auth status --lease <lease-id> --json`
- `sce auth grant ... --json`
- `sce auth revoke --lease <lease-id> --json`

### Required behavior
- write buttons are lease-aware
- missing lease produces guided auth flow
- granted lease is reused until expired/revoked

### Done when
- mutating flows do not guess policy internals
- user sees exact reason when write is blocked

## 7. Task Feedback And Timeline

### Required data
- `sce studio events --job <job-id> --json`
- `sce timeline list --limit 20 --json`
- `sce timeline show <snapshot-id> --json`

### Required UI
- task card uses `feedback_model`
- raw `event[]` moves to advanced/audit view
- timeline list uses `view_model.entries[]`
- timeline detail uses `view_model.snapshot + files_preview`

### Done when
- main task panel is human-readable
- timeline cards are recoverable and traceable

## 8. Error UX Baseline

Every page should support:
- inline section error state
- retry failed action only
- copy command error
- preserve stderr and exit code for AI-assisted diagnosis

## 9. Final Acceptance Snapshot

MagicBall can treat the current SCE integration as baseline-ready when:
- workspace shell is serialized and stable
- ontology empty-state is explicit and usable
- write authorization is shared capability, not page-by-page improvisation
- task/timeline surfaces use SCE view contracts instead of raw event-first rendering
