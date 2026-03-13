# 90-00 Moqui ERP Adapter Test Closeout

Date: 2026-03-13

## Coverage added

- Added extended Moqui client unit coverage in `tests/unit/scene-runtime/moqui-client-extended.test.js`.
- Added Moqui client property coverage in `tests/unit/scene-runtime/moqui-client.property.test.js`.
- Added Moqui adapter property coverage in `tests/unit/scene-runtime/moqui-adapter.property.test.js`.
- Added Moqui adapter handler unit coverage in `tests/unit/scene-runtime/moqui-adapter-handler.test.js`.
- Added connect/discover command coverage in `tests/unit/commands/scene-connect-discover.test.js`.

## Behaviors verified

- `MoquiClient` now has direct coverage for login success/failure, nested token payloads, 401 refresh flow, re-login fallback, retryable 5xx handling, timeout handling, dispose/logout cleanup, and retry-count invariants.
- Adapter config coverage now includes config round-trip, defaulting of optional fields, required-field validation, invalid JSON failures, binding ref parsing invariants, response mapping invariants, matcher behavior, and operation-to-HTTP request mapping.
- Handler execution coverage now exercises entity CRUD, service invoke/async/job-status, screen catalog/definition, readiness result mapping, and BindingRegistry resolution to the Moqui adapter when config is present.
- `scene connect` coverage verifies normalize/validate behavior, successful authentication, auth failure, config failure, JSON output, and client disposal.
- `scene discover` coverage verifies normalize/validate behavior, entities/services/screens typed discovery, summary discovery, auth failure, JSON output, and disposal paths.

## Verification

```powershell
npx jest tests/unit/scene-runtime/moqui-client.test.js tests/unit/scene-runtime/moqui-client-extended.test.js tests/unit/scene-runtime/moqui-client.property.test.js tests/unit/scene-runtime/moqui-adapter.test.js tests/unit/scene-runtime/moqui-adapter.property.test.js tests/unit/scene-runtime/moqui-adapter-handler.test.js tests/unit/commands/scene-connect-discover.test.js --runInBand
```

Result: all targeted tests passed.
