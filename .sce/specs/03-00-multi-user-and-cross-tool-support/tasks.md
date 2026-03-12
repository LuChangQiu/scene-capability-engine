# Implementation Plan: Multi-User and Cross-Tool Support

## Overview

This implementation plan extends kiro-spec-engine to support multi-user collaboration and cross-tool compatibility. The implementation follows a phased approach:

1. Steering management with exclusivity enforcement
2. Personal workspace infrastructure
3. Task claiming and team coordination
4. Cross-tool context export and prompt generation
5. Agent hooks investigation
6. Integration and testing

## Tasks

- [x] 1. Implement Steering Manager
  - [x] 1.1 Create SteeringManager class with detection logic
    - Implement `detectSteering()` to scan `.sce/steering/` for existing files
    - Return detection result with file list and metadata
    - _Requirements: 1.1, 2.1_
  
  - [x] 1.2 Implement strategy prompting and selection
    - Create interactive prompt for strategy selection (use-sce/use-project)
    - Display existing steering files to user
    - Validate user selection
    - _Requirements: 1.2, 2.2_
  
  - [x] 1.3 Implement steering backup functionality
    - Create `backupSteering()` method with timestamped backup directories
    - Copy existing steering files to `.sce/backups/steering-{timestamp}/`
    - Validate backup integrity
    - _Requirements: 1.3_
  
  - [x] 1.4 Implement sce steering installation
    - Create `installSceSteering()` to copy template files
    - Handle file conflicts and permissions
    - Verify installation success
    - _Requirements: 1.3_
  
  - [x] 1.5 Implement steering restoration
    - Create `restoreSteering()` for rollback capability
    - Restore from backup directory
    - Validate restoration
    - _Requirements: 1.3_
  
  - [x] 1.6 Update adoption-config.json with strategy
    - Record chosen strategy in config file
    - Include backup ID if applicable
    - Add timestamp and version info
    - _Requirements: 2.6_
  
  - [ ]* 1.7 Write property tests for Steering Manager
    - **Property 1: Steering Conflict Detection**
    - **Property 2: Steering Backup on Use-SCE**
    - **Property 3: Steering Preservation on Use-Project**
    - **Property 4: Strategy Documentation**
    - **Validates: Requirements 1.1, 1.3, 1.4, 2.1, 2.6**

- [x] 2. Integrate Steering Manager into adoption workflow
  - [x] 2.1 Update DetectionEngine to use SteeringManager
    - Call `detectSteering()` during project analysis
    - Include steering detection in analysis result
    - _Requirements: 1.1_
  
  - [x] 2.2 Update adoption command to handle steering strategies
    - Prompt for strategy when conflicts detected
    - Execute chosen strategy before template installation
    - Update adoption result with steering info
    - _Requirements: 1.2, 2.2_
  
  - [x] 2.3 Update adoption documentation
    - Document steering exclusivity constraint
    - Explain strategy options and implications
    - Provide rollback instructions
    - _Requirements: 2.6_

- [x] 3. Checkpoint - Ensure steering management works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Workspace Manager
  - [x] 4.1 Create WorkspaceManager class
    - Implement `initWorkspace()` to create personal workspace directory
    - Create `.sce/workspace/{username}/` structure
    - Generate initial CURRENT_CONTEXT.md and task-state.json
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 4.2 Implement username detection
    - Try `git config user.name` first
    - Fall back to USER or USERNAME environment variable
    - Prompt user if detection fails
    - _Requirements: 3.5_
  
  - [x] 4.3 Implement workspace path resolution
    - Create `getWorkspacePath()` to resolve current user's workspace
    - Handle missing workspace gracefully
    - _Requirements: 3.1_
  
  - [x] 4.4 Implement multi-user mode detection
    - Create `isMultiUserMode()` to check for workspace directories
    - Return true if `.sce/workspace/` exists with subdirectories
    - _Requirements: 10.2_
  
  - [x] 4.5 Implement workspace listing
    - Create `listWorkspaces()` to enumerate all user workspaces
    - Return array of usernames
    - _Requirements: 3.4_
  
  - [x] 4.6 Create workspace .gitignore
    - Add `.sce/workspace/` to project .gitignore
    - Ensure personal workspaces are not committed
    - _Requirements: 3.4_
  
  - [ ]* 4.7 Write property tests for Workspace Manager
    - **Property 5: Workspace Initialization**
    - **Property 6: Workspace Isolation**
    - **Property 7: Username Detection**
    - **Property 17: Single-User Mode Detection**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 10.2**

- [x] 5. Implement Task Claimer
  - [x] 5.1 Create TaskClaimer class with parsing logic
    - Implement tasks.md parser to extract task list
    - Parse task format: `- [status] {id} {title} [@{user}, claimed: {timestamp}]`
    - Handle various task formats gracefully
    - _Requirements: 4.1, 4.5_
  
  - [x] 5.2 Implement task claiming
    - Create `claimTask()` to mark task with username and timestamp
    - Update task status to "in-progress"
    - Detect and warn on existing claims
    - Support `--force` flag to override claims
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 5.3 Implement task unclaiming
    - Create `unclaimTask()` to remove claim marker
    - Reset task status to "not-started"
    - Verify user owns the claim before unclaiming
    - _Requirements: 4.4_
  
  - [x] 5.4 Implement claimed tasks query
    - Create `getClaimedTasks()` to list all claimed tasks in a spec
    - Return ClaimedTask objects with metadata
    - Identify stale claims (>7 days old)
    - _Requirements: 5.2, 5.5_
  
  - [x] 5.5 Implement task status updates
    - Create `updateTaskStatus()` to change task status
    - Support not-started/in-progress/completed states
    - Update checkbox markers in tasks.md
    - _Requirements: 4.2_
  
  - [ ]* 5.6 Write property tests for Task Claimer
    - **Property 8: Task Claiming**
    - **Property 9: Task Unclaiming**
    - **Property 10: Claimed Task Format**
    - **Property 12: Stale Claim Detection**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 5.5**

- [x] 6. Implement team status command
  - [x] 6.1 Create status command handler
    - Implement `sce status` command
    - List all specs in project
    - Calculate task completion statistics per spec
    - _Requirements: 5.1, 5.2_
  
  - [x] 6.2 Implement claimed tasks display
    - Group claimed tasks by developer
    - Show task status for each claim
    - Highlight stale claims
    - Format output for readability
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [ ]* 6.3 Write property tests for status command
    - **Property 11: Status Display Completeness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 7. Checkpoint - Ensure workspace and task claiming work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement workspace synchronization
  - [x] 8.1 Create workspace sync logic
    - Implement `syncWorkspace()` to reconcile personal and shared state
    - Read personal task-state.json
    - Read shared tasks.md
    - Detect conflicts between personal and shared state
    - _Requirements: 9.1, 9.2_
  
  - [x] 8.2 Implement conflict resolution
    - Prompt user for conflict resolution strategy
    - Support keep-local/keep-remote/merge options
    - Apply resolution and update both files
    - _Requirements: 9.3_
  
  - [x] 8.3 Implement sync logging
    - Log all sync operations to `.sce/workspace/{username}/sync.log`
    - Include timestamp, operation type, and result
    - Preserve personal CURRENT_CONTEXT.md during sync
    - _Requirements: 9.4, 9.5_
  
  - [ ]* 8.4 Write property tests for workspace sync
    - **Property 15: Workspace Sync Bidirectionality**
    - **Property 16: Sync Logging**
    - **Validates: Requirements 9.1, 9.2, 9.4, 9.5**

- [x] 9. Implement Context Exporter
  - [x] 9.1 Create ContextExporter class
    - Implement `exportContext()` to combine spec files
    - Read requirements.md, design.md, tasks.md
    - Optionally include steering files
    - _Requirements: 6.1, 6.2_
  
  - [x] 9.2 Implement export formatting
    - Format as single Markdown document with section headers
    - Add metadata (spec name, export timestamp, username)
    - Include usage instructions for different AI tools
    - _Requirements: 6.3, 6.5_
  
  - [x] 9.3 Implement steering rules inclusion
    - Create `includeSteeringRules()` to add steering content
    - Allow selection of specific steering files
    - Format steering rules as separate section
    - _Requirements: 6.2_
  
  - [x] 9.4 Implement export file saving
    - Save export to `.sce/specs/{spec-name}/context-export.md`
    - Ensure directory exists
    - Handle file write errors
    - _Requirements: 6.4_
  
  - [ ]* 9.5 Write property tests for Context Exporter
    - **Property 13: Context Export Completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 10. Implement Prompt Generator
  - [x] 10.1 Create PromptGenerator class
    - Implement `generatePrompt()` for task-specific prompts
    - Parse task from tasks.md
    - Extract task description and metadata
    - _Requirements: 7.1_
  
  - [x] 10.2 Implement requirements extraction
    - Create `extractRelevantRequirements()` to find related requirements
    - Parse requirements references from task description
    - Include full requirement text in prompt
    - _Requirements: 7.2_
  
  - [x] 10.3 Implement design extraction
    - Create `extractRelevantDesignSections()` to find related design
    - Identify relevant components and interfaces
    - Include design sections in prompt
    - _Requirements: 7.2_
  
  - [x] 10.4 Implement prompt formatting
    - Format prompt with task description, requirements, design
    - Add implementation guidelines
    - Include task status update instructions
    - _Requirements: 7.5_
  
  - [x] 10.5 Implement prompt file saving
    - Save prompt to `.sce/specs/{spec-name}/prompts/task-{id}.md`
    - Ensure prompts directory exists
    - Handle file write errors
    - _Requirements: 7.4_
  
  - [ ]* 10.6 Write property tests for Prompt Generator
    - **Property 14: Prompt Generation Completeness**
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5**

- [x] 11. Checkpoint - Ensure export and prompt generation work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement CLI commands
  - [x] 12.1 Create `sce workspace` command group
    - Implement `sce workspace init` to initialize personal workspace
    - Implement `sce workspace sync` to synchronize state
    - Implement `sce workspace list` to show all workspaces
    - Add command help and usage examples
    - _Requirements: 3.1, 9.2_
  
  - [x] 12.2 Create `sce task` command group
    - Implement `sce task claim {spec-name} {task-id}` to claim tasks
    - Implement `sce task unclaim {spec-name} {task-id}` to unclaim tasks
    - Add `--force` flag for claim override
    - Add command help and usage examples
    - _Requirements: 4.1, 4.4_
  
  - [x] 12.3 Create `sce context` command
    - Implement `sce context export {spec-name}` to export context
    - Add options for including/excluding sections
    - Add command help and usage examples
    - _Requirements: 6.1_
  
  - [x] 12.4 Create `sce prompt` command
    - Implement `sce prompt generate {spec-name} {task-id}` to generate prompts
    - Add options for target tool and context length
    - Add command help and usage examples
    - _Requirements: 7.1_
  
  - [x] 12.5 Update `sce status` command
    - Enhance to show claimed tasks and team status
    - Add workspace information if in multi-user mode
    - Format output for readability
    - _Requirements: 5.1_

- [x] 13. Implement backward compatibility
  - [x] 13.1 Add single-user mode detection to all commands
    - Check for workspace directories before multi-user operations
    - Provide helpful migration messages in single-user mode
    - _Requirements: 10.2, 10.3_
  
  - [x] 13.2 Implement gradual migration support
    - Allow `sce workspace init` on existing single-user projects
    - Preserve existing specs and tasks during migration
    - Update documentation with migration guide
    - _Requirements: 10.4_
  
  - [ ]* 13.3 Write property tests for backward compatibility
    - **Property 18: Gradual Migration Support**
    - **Validates: Requirements 10.4**

- [x] 14. Investigate Kiro Agent Hooks
  - [x] 14.1 Research agent hooks documentation
    - Review Kiro IDE documentation for agent hooks
    - Understand hooks API and capabilities
    - Document findings in notes
    - _Requirements: 11.1, 11.2_
  
  - [x] 14.2 Analyze use cases for sce
    - Identify potential integration points
    - Evaluate benefits and trade-offs
    - Document use cases
    - _Requirements: 11.3_
  
  - [x] 14.3 Generate recommendations
    - Determine if agent hooks should be integrated
    - Outline integration plan if beneficial
    - Document recommendations
    - _Requirements: 11.4, 11.5_
  
  - [x] 14.4 Create agent hooks analysis document
    - Write `docs/agent-hooks-analysis.md`
    - Include research findings, use cases, and recommendations
    - Provide integration plan if applicable
    - _Requirements: 11.1_

- [x] 15. Create cross-tool documentation
  - [x] 15.1 Write cross-tool usage guide
    - Create `docs/cross-tool-guide.md`
    - Document setup for Kiro IDE, Claude Code, Cursor, Codex
    - Provide example workflows for each tool
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 15.2 Document limitations and trade-offs
    - Explain feature availability per tool
    - Document manual steps required for non-Kiro tools
    - Provide troubleshooting tips
    - _Requirements: 8.4, 8.5_

- [ ] 16. Integration and end-to-end testing
  - [ ] 16.1 Test complete adoption workflow
    - Test fresh adoption with steering conflicts
    - Test strategy selection and backup
    - Verify adoption-config.json is created correctly
    - _Requirements: 1.1, 1.2, 1.3, 2.6_
  
  - [ ] 16.2 Test multi-user collaboration workflow
    - Initialize workspaces for multiple users
    - Claim tasks from different users
    - Test workspace synchronization
    - Verify isolation between workspaces
    - _Requirements: 3.1, 3.4, 4.1, 9.2_
  
  - [ ] 16.3 Test cross-tool export workflow
    - Export context for various specs
    - Generate prompts for different tasks
    - Verify exported files are usable in other tools
    - _Requirements: 6.1, 7.1_
  
  - [ ] 16.4 Test backward compatibility
    - Test single-user projects continue to work
    - Test migration from single-user to multi-user
    - Verify no breaking changes
    - _Requirements: 10.1, 10.4_

- [x] 17. Final checkpoint - Ensure all features work together
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Update project documentation
  - [x] 18.1 Update README.md
    - Add multi-user collaboration section
    - Add cross-tool compatibility section
    - Update feature list
    - _Requirements: 8.1_
  
  - [x] 18.2 Update adoption guide
    - Document steering strategy selection
    - Explain multi-user mode setup
    - Add troubleshooting section
    - _Requirements: 2.6, 3.1_
  
  - [x] 18.3 Create migration guide
    - Document migration from single-user to multi-user
    - Provide step-by-step instructions
    - Include examples and best practices
    - _Requirements: 10.3, 10.4_

## Notes

- Tasks marked with `*` are optional property tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (100+ iterations each)
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end workflows
---

## SCE Status Markers

- [x] 1 Legacy spec baseline reconciled for current release state
- [x] 2 Core capability outcomes validated and retained
- [x] 3 Tests or verification checkpoints executed
- [x] 4 Documentation and traceability synchronized
