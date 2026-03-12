# Requirements Document: Scene Doctor Task Draft Output

## Introduction

After doctor remediation checklist export, operators still need draft tasks aligned with SCE task workflow.
This spec adds doctor task draft generation so diagnostic suggestions can be turned into executable task items quickly.

## Requirements

### Requirement 1: Task Draft Export Option
- Add `--task-out <path>` to `sce scene doctor`.
- Export a markdown task draft artifact to the specified path.

### Requirement 2: Structured Task Draft Content
- Include scene context (scene id/version, domain, mode, status).
- Convert doctor suggestions into checklist tasks using numbered `- [ ] <id> ...` format.
- Order tasks by priority for execution clarity.

### Requirement 3: Report Integration
- Include generated task draft path in doctor report payload.
- Show task draft location in non-JSON doctor summary output.

### Requirement 4: Compatibility and Safety
- Preserve existing doctor behavior when `--task-out` is not provided.
- Keep blocked/healthy exit semantics unchanged.

### Requirement 5: Test and CLI Validation
- Extend unit tests to verify task draft export behavior.
- Validate CLI help and real command execution with `--task-out`.
