# Implementation Plan: Integration Test Expansion

## Overview

This implementation plan breaks down the integration test expansion into discrete, manageable tasks. The approach follows the existing test patterns from `watch-mode-integration.test.js` and focuses on creating reusable test fixtures and utilities before implementing individual command tests.

The implementation is organized to maximize efficiency: shared utilities first, then tests grouped by functional area, with checkpoints to ensure quality at each stage.

## Tasks

- [x] 1. Create shared test fixture utilities
  - Create `tests/fixtures/integration-test-fixture.js` with IntegrationTestFixture class
  - Implement setup(), cleanup(), createSpec(), createWorkspace() methods
  - Implement file operation helpers (writeFile, readFile, fileExists)
  - Add workspace configuration helpers (getWorkspaceConfig, updateWorkspaceConfig)
  - _Requirements: 15.2_

- [x] 2. Create command test helper utilities
  - Create `tests/helpers/command-test-helper.js` with CommandTestHelper class
  - Implement executeCommand() method for running commands in test environment
  - Implement captureOutput() method for capturing stdout/stderr
  - Implement validateOutput() method for pattern matching
  - Add timeout and error handling utilities
  - _Requirements: 15.2_

- [x] 3. Implement workspace integration tests
  - [x] 3.1 Create `tests/integration/workspace-integration.test.js`
    - Set up test suite with beforeEach/afterEach hooks
    - Use IntegrationTestFixture and CommandTestHelper
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 3.2 Implement workspace creation test
    - Test: Create new workspace and verify registration
    - Validate workspace appears in registry
    - _Requirements: 2.1_
  
  - [x] 3.3 Implement workspace switching test
    - Test: Switch between workspaces and verify active workspace changes
    - Validate active workspace is updated correctly
    - _Requirements: 2.2_
  
  - [x] 3.4 Implement workspace listing test
    - Test: List all workspaces and verify output format
    - Validate output contains all workspace names
    - _Requirements: 2.3_
  
  - [x] 3.5 Implement workspace deletion test
    - Test: Delete workspace and verify removal from registry
    - Validate workspace no longer appears in listing
    - _Requirements: 2.4_

- [x] 4. Implement status command integration tests
  - [x] 4.1 Add status tests to `tests/integration/workspace-integration.test.js`
    - Test: Status with active specs shows all specs
    - Test: Status with no specs shows empty state
    - Test: Status output contains workspace name and spec count
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Implement doctor command integration tests
  - [x] 5.1 Add doctor tests to `tests/integration/workspace-integration.test.js`
    - Test: Doctor on healthy workspace reports no issues
    - Test: Doctor on workspace with missing directories identifies them
    - Test: Doctor on workspace with invalid config reports errors
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Checkpoint - Verify workspace tests
  - Run workspace integration tests and ensure all pass
  - Verify test execution time is reasonable (< 5 seconds for workspace suite)
  - Ask user if questions arise

- [ ] 7. Implement project lifecycle integration tests
  - [ ] 7.1 Create `tests/integration/project-lifecycle-integration.test.js`
    - Set up test suite with beforeEach/afterEach hooks
    - Use IntegrationTestFixture and CommandTestHelper
    - _Requirements: 3.1, 3.2, 3.3, 6.1, 6.2, 6.3, 10.1, 10.2, 10.3_
  
  - [ ] 7.2 Implement adopt command tests
    - Test: Adopt project and verify .sce directory structure
    - Test: Adopt project with existing files preserves content
    - Test: Adoption produces valid workspace configuration
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ] 7.3 Implement upgrade command tests
    - Test: Upgrade from older version updates to current version
    - Test: Upgrade preserves all existing specs
    - Test: Upgrade on current version reports no upgrade needed
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 7.4 Implement rollback command tests
    - Test: Rollback after changes restores previous state
    - Test: Rollback with no history reports unavailable
    - Test: Rollback restores file contents correctly
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 8. Checkpoint - Verify project lifecycle tests
  - Run project lifecycle integration tests and ensure all pass
  - Verify test execution time is reasonable (< 5 seconds for lifecycle suite)
  - Ask user if questions arise

- [ ] 9. Implement task management integration tests
  - [ ] 9.1 Create `tests/integration/task-management-integration.test.js`
    - Set up test suite with beforeEach/afterEach hooks
    - Use IntegrationTestFixture and CommandTestHelper
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_
  
  - [ ] 9.2 Implement task command tests
    - Test: List tasks from a spec displays all tasks
    - Test: Update task status and verify persistence
    - Test: Mark task as complete and verify marking
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ] 9.3 Implement context command tests
    - Test: Export context generates context files
    - Test: Context export includes all relevant files
    - Test: Context format is valid and parseable
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ] 9.4 Implement prompt command tests
    - Test: Generate prompt from spec documents
    - Test: Prompt includes task context
    - Test: Prompt format follows expected structure
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 10. Checkpoint - Verify task management tests
  - Run task management integration tests and ensure all pass
  - Verify test execution time is reasonable (< 5 seconds for task suite)
  - Ask user if questions arise

- [ ] 11. Implement operations integration tests
  - [ ] 11.1 Create `tests/integration/operations-integration.test.js`
    - Set up test suite with beforeEach/afterEach hooks
    - Use IntegrationTestFixture and CommandTestHelper
    - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3_
  
  - [ ] 11.2 Implement workflows command tests
    - Test: List available workflows displays all workflows
    - Test: Execute workflow and verify completion
    - Test: Workflow status reports state correctly
    - _Requirements: 11.1, 11.2, 11.3_
  
  - [ ] 11.3 Implement docs command tests
    - Test: Generate documentation creates files
    - Test: Docs include all spec documents
    - Test: Docs format is valid markdown
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [ ] 11.4 Implement ops command tests
    - Test: Ops commands complete successfully
    - Test: Ops status reports operational state correctly
    - Test: Ops cleanup removes temporary files
    - _Requirements: 13.1, 13.2, 13.3_

- [ ] 12. Checkpoint - Verify operations tests
  - Run operations integration tests and ensure all pass
  - Verify test execution time is reasonable (< 5 seconds for ops suite)
  - Ask user if questions arise

- [ ] 13. Verify test coverage and performance
  - [ ] 13.1 Run complete integration test suite
    - Execute all integration tests (existing + new)
    - Verify all tests pass consistently
    - _Requirements: 1.1, 1.2_
  
  - [ ] 13.2 Measure test execution time
    - Verify total execution time is under 20 seconds
    - Identify any slow tests that need optimization
    - _Requirements: 14.1, 14.2_
  
  - [ ] 13.3 Verify critical path coverage
    - Run coverage analysis using existing tools
    - Verify 80%+ coverage of 32 critical paths
    - Document coverage results
    - _Requirements: 1.3_

- [x] 14. Update documentation
  - [x] 14.1 Update `docs/testing-strategy.md`
    - Document new integration test structure
    - Add guidance for writing new integration tests
    - Include examples of using test fixtures and helpers
    - _Requirements: 15.1, 15.2_
  
  - [x] 14.2 Create integration test README
    - Create `tests/integration/README.md`
    - Document test organization and patterns
    - Provide examples of common test scenarios
    - Include troubleshooting guide
    - _Requirements: 15.1, 15.2, 15.3_

- [ ] 15. Final checkpoint - Complete verification
  - Run full test suite (unit + integration) and verify all pass
  - Verify CI execution time remains under 20 seconds
  - Review test coverage report
  - Ensure all documentation is complete
  - Ask user if questions arise

## Notes

- Each test file should follow the patterns established in `watch-mode-integration.test.js`
- Use real file system operations (fs-extra) rather than mocks
- Ensure proper cleanup in afterEach hooks to prevent test pollution
- Group related tests to share fixtures and improve performance
- Set appropriate timeouts for long-running tests (15000ms)
- Include clear error messages for debugging test failures
- All test fixtures should be created in `tests/fixtures/integration-test/` subdirectories
- Use unique directory names per test to enable parallel execution
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
