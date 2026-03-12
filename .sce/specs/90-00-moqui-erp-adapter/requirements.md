# Requirements Document

## Introduction

This feature implements a real Moqui ERP Adapter for SCE's scene runtime binding registry. The adapter replaces the simulated `builtin.erp-sim` handler with a production-ready handler that connects to a Moqui ERP instance's REST API (`/api/v1/`). It enables SCE scene manifests with ERP bindings to execute real entity CRUD operations, invoke Moqui services (sync and async), and query screen definitions against a live Moqui backend. The adapter handles JWT authentication with automatic token refresh, maps Moqui's standardized response format to SCE execution results, and integrates two new CLI subcommands (`sce scene connect` and `sce scene discover`) for connection verification and capability discovery.

## Glossary

- **Moqui_Adapter**: The binding handler registered in SCE's BindingRegistry that routes `spec.erp.*` and `moqui.*` binding refs to a live Moqui instance's REST API.
- **Moqui_Client**: The HTTP client module that manages low-level communication with a Moqui instance, including request construction, JWT token lifecycle, and response normalization.
- **Adapter_Config**: A JSON configuration object (loaded from `moqui-adapter.json` or passed programmatically) containing connection settings: baseUrl, credentials, timeout, retry policy.
- **JWT_Token_Pair**: The access token and refresh token pair returned by Moqui's `/api/v1/auth/login` endpoint, used for authenticating subsequent API requests.
- **Entity_Endpoint**: Moqui's `/api/v1/entities/{entityName}` REST endpoint supporting GET (list/get), POST (create), PUT (update), and DELETE operations.
- **Service_Endpoint**: Moqui's `/api/v1/services/{serviceName}` REST endpoint supporting POST for synchronous and asynchronous service invocation.
- **Screen_Endpoint**: Moqui's `/api/v1/screens` REST endpoint for querying screen catalog and screen definitions.
- **Moqui_Response**: The standardized response format from Moqui: `{ success: boolean, data: {...}, meta: {...}, error: { code, message, details } }`.
- **Execution_Result**: SCE's binding execution result format: `{ status: 'success'|'failed', handler_id, binding_ref, ... }`.
- **Connect_Command**: The `sce scene connect` CLI subcommand for testing and verifying connectivity to a Moqui instance.
- **Discover_Command**: The `sce scene discover` CLI subcommand for listing available entities, services, and screens from a connected Moqui instance.
- **Binding_Ref**: A string reference in a scene manifest binding (e.g., `spec.erp.order-query-service`, `moqui.OrderHeader.list`) that the Moqui_Adapter matches against.

## Requirements

### Requirement 1: Adapter Configuration

**User Story:** As a developer, I want to configure the Moqui adapter with connection settings, so that SCE can connect to my Moqui ERP instance.

#### Acceptance Criteria

1. THE Moqui_Adapter SHALL load Adapter_Config from a `moqui-adapter.json` file in the project root or a path specified via `--config` option.
2. THE Adapter_Config SHALL require a `baseUrl` field specifying the Moqui instance root URL (e.g., `http://localhost:8080`).
3. THE Adapter_Config SHALL require a `credentials` object containing `username` and `password` fields for JWT authentication.
4. THE Adapter_Config SHALL accept optional `timeout` (integer milliseconds, default 30000), `retryCount` (integer, default 2), and `retryDelay` (integer milliseconds, default 1000) fields.
5. IF the Adapter_Config file is missing or contains invalid JSON, THEN THE Moqui_Adapter SHALL return a descriptive error indicating the configuration problem.
6. IF the Adapter_Config is missing required fields (`baseUrl` or `credentials`), THEN THE Moqui_Adapter SHALL return a validation error listing the missing fields.

### Requirement 2: JWT Authentication Lifecycle

**User Story:** As a developer, I want the adapter to handle authentication automatically, so that I do not need to manage tokens manually during scene execution.

#### Acceptance Criteria

1. WHEN the Moqui_Client is initialized, THE Moqui_Client SHALL authenticate by sending a POST request to `/api/v1/auth/login` with the configured credentials and store the returned JWT_Token_Pair.
2. WHEN making an API request, THE Moqui_Client SHALL include the access token in the `Authorization: Bearer <token>` header.
3. WHEN an API request receives a 401 response, THE Moqui_Client SHALL attempt to refresh the access token by sending a POST request to `/api/v1/auth/refresh` with the refresh token.
4. WHEN the token refresh succeeds, THE Moqui_Client SHALL retry the original request with the new access token.
5. IF the token refresh fails (refresh token expired or invalid), THEN THE Moqui_Client SHALL attempt a full re-login using the configured credentials.
6. IF both token refresh and re-login fail, THEN THE Moqui_Client SHALL return an authentication error with status `failed` and error code `AUTH_FAILED`.
7. WHEN the Moqui_Client is disposed, THE Moqui_Client SHALL send a POST request to `/api/v1/auth/logout` to invalidate the current token pair.

### Requirement 3: Entity Operations

**User Story:** As a scene author, I want to perform entity CRUD operations through scene bindings, so that scenes can read and write ERP data.

#### Acceptance Criteria

1. WHEN a binding node with operation `list` is executed, THE Moqui_Adapter SHALL send a GET request to `/api/v1/entities/{entityName}` with query parameters for pagination (`pageIndex`, `pageSize`), filtering, and sorting extracted from the binding node payload.
2. WHEN a binding node with operation `get` is executed, THE Moqui_Adapter SHALL send a GET request to `/api/v1/entities/{entityName}/{id}` to retrieve a single entity record.
3. WHEN a binding node with operation `create` is executed, THE Moqui_Adapter SHALL send a POST request to `/api/v1/entities/{entityName}` with the entity data from the binding node payload.
4. WHEN a binding node with operation `update` is executed, THE Moqui_Adapter SHALL send a PUT request to `/api/v1/entities/{entityName}/{id}` with the updated fields from the binding node payload.
5. WHEN a binding node with operation `delete` is executed, THE Moqui_Adapter SHALL send a DELETE request to `/api/v1/entities/{entityName}/{id}`.
6. WHEN a Moqui_Response with `success: true` is received, THE Moqui_Adapter SHALL map the response to an Execution_Result with `status: 'success'` and include the response `data` and `meta` fields.
7. WHEN a Moqui_Response with `success: false` is received, THE Moqui_Adapter SHALL map the response to an Execution_Result with `status: 'failed'` and include the error `code`, `message`, and `details`.

### Requirement 4: Service Invocation

**User Story:** As a scene author, I want to invoke Moqui services through scene bindings, so that scenes can trigger business logic on the ERP.

#### Acceptance Criteria

1. WHEN a binding node with operation `invoke` and mode `sync` is executed, THE Moqui_Adapter SHALL send a POST request to `/api/v1/services/{serviceName}` with the service parameters from the binding node payload and return the result directly.
2. WHEN a binding node with operation `invoke` and mode `async` is executed, THE Moqui_Adapter SHALL send a POST request to `/api/v1/services/{serviceName}` with `async: true` in the request body and return the job ID from the response.
3. WHEN a binding node with operation `job-status` is executed, THE Moqui_Adapter SHALL send a GET request to query the job status using the job ID from the binding node payload.
4. WHEN an async service invocation completes, THE Moqui_Adapter SHALL map the job result to an Execution_Result with the appropriate status and output data.

### Requirement 5: Screen Discovery

**User Story:** As a scene author, I want to query Moqui screen definitions, so that scenes can discover available UI structures for template extraction.

#### Acceptance Criteria

1. WHEN a binding node with operation `screen-catalog` is executed, THE Moqui_Adapter SHALL send a GET request to `/api/v1/screens` and return the screen catalog listing.
2. WHEN a binding node with operation `screen-definition` is executed, THE Moqui_Adapter SHALL send a GET request to `/api/v1/screens/{screenPath}` and return the screen definition including forms and widgets.

### Requirement 6: Binding Registry Integration

**User Story:** As a SCE maintainer, I want the Moqui adapter to integrate with the existing BindingRegistry, so that scene manifests with ERP bindings execute against the real Moqui instance.

#### Acceptance Criteria

1. THE Moqui_Adapter SHALL register as a handler in the BindingRegistry with match criteria for binding refs starting with `spec.erp.` and `moqui.`.
2. THE Moqui_Adapter SHALL implement the `execute(node, payload)` interface expected by the BindingRegistry.
3. THE Moqui_Adapter SHALL implement a `readiness(node, payload)` function that verifies the Moqui instance is reachable and authenticated before scene execution.
4. WHEN the Moqui instance is unreachable during a readiness check, THE Moqui_Adapter SHALL return `{ passed: false, reason: 'moqui-unreachable' }`.
5. WHEN the Moqui instance is reachable but authentication fails during a readiness check, THE Moqui_Adapter SHALL return `{ passed: false, reason: 'moqui-auth-failed' }`.
6. THE Moqui_Adapter SHALL parse the binding ref to extract the entity name, service name, or operation type (e.g., `moqui.OrderHeader.list` maps to entity `OrderHeader` with operation `list`).

### Requirement 7: Error Handling and Resilience

**User Story:** As a developer, I want the adapter to handle errors gracefully, so that scene execution provides clear diagnostics when Moqui operations fail.

#### Acceptance Criteria

1. IF a network error occurs (connection refused, DNS resolution failure), THEN THE Moqui_Client SHALL return an Execution_Result with `status: 'failed'`, error code `NETWORK_ERROR`, and a descriptive message including the target URL.
2. IF a request times out, THEN THE Moqui_Client SHALL return an Execution_Result with `status: 'failed'`, error code `TIMEOUT`, and the configured timeout value in the message.
3. WHEN a retryable error occurs (network error or 5xx response), THE Moqui_Client SHALL retry the request up to `retryCount` times with `retryDelay` milliseconds between attempts.
4. IF all retry attempts are exhausted, THEN THE Moqui_Client SHALL return the last error as the Execution_Result.
5. WHEN a Moqui_Response contains an error object, THE Moqui_Adapter SHALL preserve the original Moqui error code, message, and details in the Execution_Result.

### Requirement 8: Connect Command

**User Story:** As a developer, I want to verify my Moqui connection before running scenes, so that I can diagnose configuration and connectivity issues.

#### Acceptance Criteria

1. WHEN the Connect_Command is invoked, THE Connect_Command SHALL load the Adapter_Config, attempt to authenticate with the Moqui instance, and report the connection status.
2. WHEN the connection succeeds, THE Connect_Command SHALL display the Moqui instance base URL, authentication status, and server metadata if available.
3. IF the connection fails, THEN THE Connect_Command SHALL display the error reason (network error, auth failure, invalid config) and set exit code to 1.
4. THE Connect_Command SHALL accept `--config <path>` to specify a custom Adapter_Config file path.
5. THE Connect_Command SHALL accept `--json` to output the result as structured JSON.
6. THE Connect_Command SHALL accept `--registry <dir>` to specify a custom registry directory, defaulting to `.sce/registry`.

### Requirement 9: Discover Command

**User Story:** As a developer, I want to list available entities, services, and screens from a Moqui instance, so that I can understand what capabilities are available for scene bindings.

#### Acceptance Criteria

1. WHEN the Discover_Command is invoked with `--type entities`, THE Discover_Command SHALL query the Moqui API catalog and display available entity names.
2. WHEN the Discover_Command is invoked with `--type services`, THE Discover_Command SHALL query the Moqui API catalog and display available service names.
3. WHEN the Discover_Command is invoked with `--type screens`, THE Discover_Command SHALL query the Moqui screen catalog and display available screen paths.
4. WHEN the Discover_Command is invoked without `--type`, THE Discover_Command SHALL display a summary of all available entities, services, and screens with counts.
5. THE Discover_Command SHALL accept `--config <path>` to specify a custom Adapter_Config file path.
6. THE Discover_Command SHALL accept `--json` to output the result as structured JSON.
7. IF the Moqui instance is unreachable or authentication fails, THEN THE Discover_Command SHALL display the error reason and set exit code to 1.

### Requirement 10: Command Pattern Compliance

**User Story:** As a SCE maintainer, I want the new commands to follow existing patterns, so that the codebase remains consistent.

#### Acceptance Criteria

1. THE Connect_Command SHALL implement `normalizeSceneConnectOptions`, `validateSceneConnectOptions`, `runSceneConnectCommand`, and `printSceneConnectSummary` functions following the established pattern.
2. THE Discover_Command SHALL implement `normalizeSceneDiscoverOptions`, `validateSceneDiscoverOptions`, `runSceneDiscoverCommand`, and `printSceneDiscoverSummary` functions following the established pattern.
3. THE Connect_Command and Discover_Command SHALL accept a `dependencies` parameter for dependency injection in the run functions.
4. THE Connect_Command and Discover_Command SHALL be registered as `scene connect` and `scene discover` subcommands within `registerSceneCommands`.
5. THE Connect_Command and Discover_Command SHALL export all four functions in `module.exports`.
