# MagicBall Write Auth Adaptation Guide

## Goal

Define how MagicBall should adapt to SCE write-authorization requirements.

This guide focuses on:
1. which actions require authorization
2. how MagicBall should request or reuse a lease
3. how to pass lease information to SCE
4. how to handle denied / expired / invalid lease errors

This guide is intentionally frontend-oriented.

## Current SCE Authorization Model

SCE uses a write-authorization layer centered on:
- policy file: `.sce/config/authorization-policy.json`
- lease storage: `.sce/state/sce-state.sqlite`
- commands:
  - `sce auth grant`
  - `sce auth status`
  - `sce auth revoke`

The runtime enforcement entry is:
- `ensureWriteAuthorization(...)`

## What MagicBall Should Assume By Default

MagicBall should assume:
1. read operations do not require lease
2. write operations may require lease
3. the exact enforcement depends on SCE policy
4. frontend must not guess policy internals from static assumptions

Therefore, MagicBall should design write flows as:
- optimistic if lease exists
- blocked-with-guidance if lease is missing or invalid

## SCE Commands Relevant To Auth

### Grant lease
```bash
sce auth grant --scope <scope> --reason "<reason>" --json
```

### Inspect lease status
```bash
sce auth status --json
sce auth status --lease <lease-id> --json
```

### Revoke lease
```bash
sce auth revoke --lease <lease-id> --json
```

## Scopes MagicBall Should Care About

Current implemented write flows in SCE imply these practical action families:

### App / mode related
- `app:bundle:register`
- `app:registry:configure`
- `app:engineering:attach`
- `app:engineering:hydrate`
- `app:engineering:scaffold`
- `app:engineering:activate`
- `app:runtime:install`
- `app:runtime:activate`
- `app:runtime:uninstall`

### Engineering mode PM data plane
- `pm:requirement:upsert`
- `pm:tracking:upsert`
- `pm:planning:upsert`
- `pm:change:upsert`
- `pm:issue:upsert`

### Ontology mode data plane
- `ontology:er:upsert`
- `ontology:br:upsert`
- `ontology:dl:upsert`

### Existing studio/task actions
- `studio:apply`
- `studio:release`
- `studio:rollback`
- `task:rerun`

## Recommended MagicBall UI Rule

### Rule 1
Treat all mutating actions as lease-aware actions.

### Rule 2
Do not hide all write buttons permanently.
Instead:
- show action button
- if no valid lease is present, show locked state or auth prompt before execution

### Rule 3
For dangerous write actions, require an explicit authorization step even if the button is visible.

## Recommended Frontend State Model

MagicBall should keep a lightweight authorization state model:

```ts
interface WriteLeaseState {
  leaseId: string | null
  subject: string | null
  role: string | null
  scope: string[]
  expiresAt: string | null
  revokedAt: string | null
  active: boolean
  stale: boolean
}
```

Recommended derived flags:
- `hasLease`
- `leaseActive`
- `leaseExpired`
- `scopeSatisfied(action)`

## Recommended Frontend Flow

### 1. Startup / app switch
When MagicBall starts or switches app/project context:
1. call `sce auth status --json`
2. cache active leases
3. derive whether current user/session can write

### 2. Before a write action
When user clicks a write action:
1. map UI action to SCE action scope
2. check local cached lease state
3. if lease exists and scope matches, execute command with `--auth-lease <lease-id>`
4. if lease missing or insufficient, open auth prompt flow

### 3. Auth prompt flow
Recommended UI steps:
1. show why authorization is required
2. show requested action scope
3. ask user to authorize
4. execute `sce auth grant ... --json`
5. cache returned `lease_id`
6. retry original write action with `--auth-lease`

## Suggested UI Copy Pattern

### Locked action hint
- `This action requires SCE write authorization.`
- `Requested scope: pm:requirement:upsert`

### Grant dialog content
- `Action`: human-readable action name
- `Requested scope`: exact SCE scope string
- `Reason`: user-editable reason text
- `Password`: if needed by policy

### Success hint
- `Write authorization granted for 15 minutes.`

### Failure hint
- `Authorization failed. Check password, lease policy, or requested scope.`

## Recommended Scope Mapping Table

| MagicBall UI action | SCE command | Required scope |
| --- | --- | --- |
| Save app bundle | `sce app bundle register` | `app:bundle:register` |
| Update registry config | `sce app registry configure` | `app:registry:configure` |
| Attach engineering project | `sce app engineering attach` | `app:engineering:attach` |
| Hydrate engineering workspace | `sce app engineering hydrate` | `app:engineering:hydrate` |
| Scaffold engineering workspace baseline | `sce app engineering scaffold` | `app:engineering:scaffold` |
| Activate engineering workspace | `sce app engineering activate` | `app:engineering:activate` |
| Install runtime release | `sce app runtime install` | `app:runtime:install` |
| Activate runtime release | `sce app runtime activate` | `app:runtime:activate` |
| Uninstall runtime release | `sce app runtime uninstall` | `app:runtime:uninstall` |
| Save requirement | `sce pm requirement upsert` | `pm:requirement:upsert` |
| Save tracking item | `sce pm tracking upsert` | `pm:tracking:upsert` |
| Save plan | `sce pm planning upsert` | `pm:planning:upsert` |
| Save change request | `sce pm change upsert` | `pm:change:upsert` |
| Save issue item | `sce pm issue upsert` | `pm:issue:upsert` |
| Save ER asset | `sce ontology er upsert` | `ontology:er:upsert` |
| Save BR rule | `sce ontology br upsert` | `ontology:br:upsert` |
| Save DL chain | `sce ontology dl upsert` | `ontology:dl:upsert` |
| Apply studio change | `sce studio apply` | `studio:apply` |
| Release studio result | `sce studio release` | `studio:release` |
| Rollback studio result | `sce studio rollback` | `studio:rollback` |
| Rerun task | `sce task rerun` | `task:rerun` |

## Recommended Grant Command Patterns

### Generic lease
```bash
sce auth grant --scope app:runtime:activate --reason "activate selected runtime release" --json
```

### Runtime uninstall lease
```bash
sce auth grant --scope app:runtime:uninstall --reason "remove non-active installed runtime release" --json
```

### Multiple scopes if one workflow batches mutations
```bash
sce auth grant --scope app:engineering:attach,app:engineering:hydrate,app:engineering:scaffold,app:engineering:activate --reason "initialize engineering workspace" --json
```

## How MagicBall Should Pass Lease To SCE

For every write command, pass:
- `--auth-lease <lease-id>`

Example:
```bash
sce pm requirement upsert --input requirement.json --auth-lease <lease-id> --json
```

## Error Handling Rules

MagicBall should not treat all write failures the same.

### Case A: lease required
Typical symptom:
- error mentions `Write authorization required`
- or says lease is required for action

Frontend action:
1. keep form state intact
2. open authorization prompt
3. let user retry after grant

### Case B: lease not found
Typical symptom:
- error mentions `lease not found`

Frontend action:
1. clear cached lease id
2. force refresh auth status
3. reopen grant flow

### Case C: lease expired / revoked
Typical symptom:
- error mentions expired / revoked / inactive lease

Frontend action:
1. mark local lease stale
2. force refresh auth status
3. ask user to grant again

### Case D: scope mismatch
Typical symptom:
- authorization denied for action despite active lease

Frontend action:
1. show requested scope
2. request a new lease with broader or correct scope

### Case E: business validation error
Typical symptom:
- payload/field/schema validation failure
- no auth wording in error message

Frontend action:
1. do not reopen auth flow
2. keep current form state
3. show validation feedback only

## Recommended Frontend State Machine

```text
idle
  -> checking_lease
  -> lease_ready
  -> lease_missing
  -> requesting_lease
  -> lease_granted
  -> executing_write
  -> write_succeeded
  -> write_failed_auth
  -> write_failed_validation
```

## Minimal Frontend Implementation Checklist

### Required now
1. local lease cache
2. `auth status` fetch on startup / app switch
3. action-to-scope mapping table
4. shared auth prompt dialog
5. automatic retry of blocked action after successful grant

### Can wait
1. lease auto-refresh before expiry
2. batch lease orchestration for multi-step workflows
3. lease history panel
4. revoke button in UI

## Recommended MagicBall Button Policy

### Safe read-only buttons
- always enabled

### Write buttons with no lease
- visible
- disabled or soft-blocked
- click opens auth dialog

### Write buttons with valid lease
- enabled
- execute command with `--auth-lease`

### High-risk buttons
Examples:
- runtime activate
- engineering activate
- studio release
- backup restore

Recommended behavior:
- keep visible
- require explicit confirmation even with valid lease

## Practical Conclusion

MagicBall should now implement write authorization as a shared UI capability, not as page-by-page special handling.

The most important thing is:
- centralize scope mapping
- centralize lease state
- centralize retry-after-grant flow

That will keep all app/runtime/pm/ontology/studio write flows consistent.
