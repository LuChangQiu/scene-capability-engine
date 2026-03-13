# Implementation Plan: Moqui ERP Adapter

## Overview

Implement the Moqui ERP Adapter in three modules: MoquiClient (HTTP + JWT), MoquiAdapter (binding handler), and CLI commands (connect + discover). All code uses Node.js built-in `http`/`https` — no new dependencies. Tests use Jest + fast-check.

## Tasks

- [x] 1. Implement MoquiClient HTTP client
  - [x] 1.1 Create `lib/scene-runtime/moqui-client.js` with MoquiClient class
    - Constructor accepting config object (baseUrl, credentials, timeout, retryCount, retryDelay)
    - `_httpRequest(method, fullUrl, options)` using Node.js built-in `http`/`https` modules
    - `login()` — POST `/api/v1/auth/login`, store JWT token pair
    - `refreshToken()` — POST `/api/v1/auth/refresh` with stored refresh token
    - `logout()` — POST `/api/v1/auth/logout`
    - `request(method, path, options)` — authenticated request with auto 401→refresh→retry flow
    - `isAuthenticated()` and `dispose()` lifecycle methods
    - Retry logic: retry on network errors and 5xx up to `retryCount` times with `retryDelay` delay
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1, 7.2, 7.3, 7.4_

  - [x]* 1.2 Write unit tests for MoquiClient
    - Test login success/failure with mocked HTTP
    - Test token refresh flow (401 → refresh → retry)
    - Test re-login fallback when refresh fails
    - Test dispose calls logout
    - Test retry logic for network errors and 5xx
    - Test timeout handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1, 7.2, 7.3, 7.4_

  - [x]* 1.3 Write property test for retry count
    - **Property 9: Retry logic respects retryCount**
    - **Validates: Requirements 7.3, 7.4**

- [x] 2. Implement MoquiAdapter config and parsing
  - [x] 2.1 Create `lib/scene-runtime/moqui-adapter.js` with config and parsing functions
    - `loadAdapterConfig(configPath, projectRoot)` — load and parse JSON config file
    - `validateAdapterConfig(config)` — validate required fields, apply defaults for optional fields
    - `parseBindingRef(bindingRef)` — parse `moqui.*` and `spec.erp.*` refs into operation descriptors
    - `mapMoquiResponseToResult(moquiResponse, handlerId, bindingRef)` — map Moqui response to Execution_Result
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.6, 3.6, 3.7, 7.5_

  - [x]* 2.2 Write property test for config round-trip
    - **Property 1: Config load round-trip**
    - **Validates: Requirements 1.1**

  - [x]* 2.3 Write property test for config defaults
    - **Property 2: Config defaults for optional fields**
    - **Validates: Requirements 1.4**

  - [x]* 2.4 Write property test for config validation
    - **Property 3: Config validation catches missing required fields**
    - **Validates: Requirements 1.6**

  - [x]* 2.5 Write property test for invalid JSON config
    - **Property 4: Invalid JSON config produces descriptive error**
    - **Validates: Requirements 1.5**

  - [x]* 2.6 Write property test for parseBindingRef
    - **Property 5: parseBindingRef correctly extracts components**
    - **Validates: Requirements 6.6**

  - [x]* 2.7 Write property test for response mapping
    - **Property 8: Moqui response maps to correct Execution_Result**
    - **Validates: Requirements 3.6, 3.7, 7.5**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement BindingRegistry integration and execute logic
  - [x] 4.1 Add `createMoquiAdapterHandler(options)` to `moqui-adapter.js`
    - Create handler object with `id: 'moqui.adapter'`
    - Match function for `spec.erp.*` and `moqui.*` binding ref prefixes
    - `execute(node, payload)` — parse binding ref, build HTTP request (method + path), call MoquiClient, map response
    - `readiness(node, payload)` — load config, attempt login, return `{ passed, reason }`
    - Operation-to-HTTP mapping: list→GET entities, get→GET entities/id, create→POST, update→PUT, delete→DELETE, invoke→POST services, job-status→GET, screen-catalog→GET screens, screen-definition→GET screens/path
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2_

  - [x]* 4.2 Write property test for binding ref matcher
    - **Property 6: Binding ref matcher matches correct prefixes**
    - **Validates: Requirements 6.1**

  - [x]* 4.3 Write property test for operation-to-HTTP mapping
    - **Property 7: Operation descriptor maps to correct HTTP method and path**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2**

  - [x]* 4.4 Write unit tests for MoquiAdapter handler
    - Test execute with mocked MoquiClient for each operation type
    - Test readiness success, unreachable, auth-failed cases
    - Test BindingRegistry.resolve matches moqui/spec.erp refs to adapter handler
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 5. Implement CLI commands (connect + discover)
  - [x] 5.1 Add connect command functions to `lib/commands/scene.js`
    - `normalizeSceneConnectOptions(options)` — normalize config, registry, json options
    - `validateSceneConnectOptions(options)` — validate options (no required fields)
    - `runSceneConnectCommand(rawOptions, dependencies)` — load config, create MoquiClient, login, build payload, print, dispose
    - `printSceneConnectSummary(options, payload)` — JSON or human-readable output
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.3_

  - [x] 5.2 Add discover command functions to `lib/commands/scene.js`
    - `normalizeSceneDiscoverOptions(options)` — normalize config, type, json options
    - `validateSceneDiscoverOptions(options)` — validate --type is entities|services|screens or undefined
    - `runSceneDiscoverCommand(rawOptions, dependencies)` — load config, create MoquiClient, login, query catalog, build payload, print, dispose
    - `printSceneDiscoverSummary(options, payload)` — JSON or human-readable output
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.2, 10.3_

  - [x] 5.3 Register commands and update exports in `lib/commands/scene.js`
    - Register `scene connect` and `scene discover` subcommands in `registerSceneCommands`
    - Add all 8 new functions to `module.exports`
    - _Requirements: 10.4, 10.5_

  - [x]* 5.4 Write unit tests for connect command
    - Test normalize/validate/run/print with mocked adapter
    - Test success and failure scenarios
    - Test --json output mode
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x]* 5.5 Write unit tests for discover command
    - Test normalize/validate/run/print with mocked adapter
    - Test each --type variant and summary mode
    - Test --json output mode
    - Test error handling (unreachable, auth failure)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- No external dependencies — uses Node.js built-in `http`/`https` for HTTP
- MoquiClient HTTP layer is mocked in all tests (no real Moqui instance needed)
- Property tests use `fast-check` with 100+ iterations, tagged with property numbers
- Checkpoints ensure incremental validation
