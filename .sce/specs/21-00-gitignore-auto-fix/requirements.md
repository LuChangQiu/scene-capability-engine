# Requirements: .gitignore Auto-Fix for Team Collaboration

## 1. Overview

**Feature**: Automatic .gitignore correction during sce adoption and upgrade

**Problem**: 
- Users may have old .gitignore that excludes entire `.sce/` directory
- This prevents Spec documents from being shared with team
- Loses core value of Spec-driven development
- Manual .gitignore updates are error-prone

**Solution**:
- Automatically detect and fix .gitignore during `sce adopt` and `sce upgrade`
- Use layered strategy: commit Specs, exclude personal state
- Create backup before modification
- Clear messaging about what changed and why

---

## 2. Functional Requirements

### 2.1 .gitignore Detection

**FR-2.1.1**: Detect .gitignore file existence
- Check if `.gitignore` exists in project root
- If not exists, create with recommended content
- If exists, analyze current rules

**FR-2.1.2**: Analyze current .gitignore rules
- Detect if `.sce/` is completely excluded
- Detect if using old exclusion patterns
- Identify missing layered rules

**FR-2.1.3**: Determine fix strategy
- **Strategy 1 - Add**: No .sce rules exist → add layered rules
- **Strategy 2 - Update**: Old rules exist → replace with layered rules
- **Strategy 3 - Skip**: Already using layered strategy → no action

### 2.2 .gitignore Auto-Fix

**FR-2.2.1**: Create backup before modification
- Backup original .gitignore to `.sce/backups/gitignore-{timestamp}`
- Include backup ID in result message
- Allow rollback if needed

**FR-2.2.2**: Apply layered .gitignore strategy
- Remove blanket `.sce/` exclusion if present
- Add layered exclusion rules:
  - Personal state files (CURRENT_CONTEXT.md, contexts/*/CURRENT_CONTEXT.md)
  - Environment configuration (environments.json, env-backups/)
  - Temporary files (backups/, logs/, reports/)
  - Spec temporary files (SESSION-*.md, *-SUMMARY.md, etc.)
- Preserve existing non-.sce rules

**FR-2.2.3**: Preserve user customizations
- Keep all non-.sce related rules
- Maintain rule order where possible
- Add .sce rules in dedicated section with comments

**FR-2.2.4**: Handle edge cases
- Multiple .gitignore files (root + subdirectories)
- Commented-out rules
- Negation rules (!.sce/specs/)
- Platform-specific rules

### 2.3 User Communication

**FR-2.3.1**: Clear progress messages
- Show detection result
- Explain why fix is needed
- Display what will change
- Show backup location

**FR-2.3.2**: Summary after fix
- List rules added/removed/updated
- Explain benefits of layered strategy
- Provide rollback instructions
- Link to team collaboration guide

**FR-2.3.3**: No fix needed message
- If already compliant, show success message
- Explain current strategy is optimal
- No unnecessary changes

### 2.4 Integration Points

**FR-2.4.1**: Integrate with `sce adopt`
- Run .gitignore check after adoption
- Fix before showing "adoption complete" message
- Include in adoption summary

**FR-2.4.2**: Integrate with `sce upgrade`
- Run .gitignore check after upgrade
- Fix as part of upgrade process
- Include in upgrade summary

**FR-2.4.3**: Standalone command (optional)
- `sce doctor --fix-gitignore` for manual fix
- Useful for existing projects
- Can be run independently

---

## 3. Non-Functional Requirements

### 3.1 Safety

**NFR-3.1.1**: Always create backup before modification
- Never modify .gitignore without backup
- Backup must be verifiable
- Rollback must be reliable

**NFR-3.1.2**: Preserve user intent
- Don't remove user-added rules
- Don't change rule semantics
- Maintain functional equivalence where possible

### 3.2 Performance

**NFR-3.2.1**: Fast detection
- .gitignore analysis < 100ms
- No impact on adoption/upgrade time
- Efficient pattern matching

### 3.3 Usability

**NFR-3.3.1**: Clear messaging
- Non-technical language
- Explain "why" not just "what"
- Provide actionable next steps

**NFR-3.3.2**: Minimal disruption
- Automatic by default
- No user confirmation needed (with backup)
- Opt-out available if needed

### 3.4 Compatibility

**NFR-3.4.1**: Cross-platform
- Windows, Linux, macOS
- Handle different line endings (CRLF vs LF)
- Platform-specific path separators

**NFR-3.4.2**: Git compatibility
- Follow .gitignore syntax rules
- Respect negation patterns
- Handle comments correctly

---

## 4. Acceptance Criteria

### AC-4.1: Detection Accuracy

- ✅ Correctly identifies blanket `.sce/` exclusion
- ✅ Detects missing layered rules
- ✅ Recognizes already-compliant .gitignore
- ✅ Handles missing .gitignore file

### AC-4.2: Fix Correctness

- ✅ Removes blanket `.sce/` exclusion
- ✅ Adds all required layered rules
- ✅ Preserves non-.sce rules
- ✅ Maintains rule order where possible
- ✅ Creates valid .gitignore syntax

### AC-4.3: Safety

- ✅ Creates backup before modification
- ✅ Backup is restorable
- ✅ No data loss on error
- ✅ Rollback works correctly

### AC-4.4: User Experience

- ✅ Clear progress messages
- ✅ Explains why fix is needed
- ✅ Shows what changed
- ✅ Provides rollback instructions
- ✅ Links to documentation

### AC-4.5: Integration

- ✅ Works in `sce adopt` flow
- ✅ Works in `sce upgrade` flow
- ✅ Can be run standalone
- ✅ Doesn't break existing workflows

---

## 5. User Stories

### US-5.1: New Project Adoption

**As a** developer adopting sce for the first time  
**I want** .gitignore to be automatically configured  
**So that** I can share Specs with my team without manual setup

**Acceptance**:
- Run `sce adopt`
- .gitignore is created/updated automatically
- Specs are committable, personal state is excluded
- Clear message explains what happened

### US-5.2: Existing Project Upgrade

**As a** developer upgrading from old sce version  
**I want** .gitignore to be automatically updated  
**So that** I get the new layered strategy without manual work

**Acceptance**:
- Run `sce upgrade` or `sce adopt`
- Old `.sce/` exclusion is replaced
- Layered rules are added
- Backup is created
- Can rollback if needed

### US-5.3: Team Onboarding

**As a** new team member cloning a project  
**I want** .gitignore to be correct from the start  
**So that** I can see all Specs and contribute immediately

**Acceptance**:
- Clone project with sce
- Run `sce adopt`
- .gitignore is already optimal
- Can see all Spec documents
- Personal state is excluded

### US-5.4: Manual Fix

**As a** developer with existing project  
**I want** to manually fix .gitignore  
**So that** I can update without full adoption/upgrade

**Acceptance**:
- Run `sce doctor --fix-gitignore`
- .gitignore is analyzed and fixed
- Backup is created
- Summary shows changes

---

## 6. Out of Scope

- ❌ Fixing .gitignore in subdirectories (only root)
- ❌ Analyzing git history for .gitignore changes
- ❌ Syncing .gitignore across team members
- ❌ Validating other git configuration files
- ❌ Managing .git/info/exclude file

---

## 7. Dependencies

- Existing backup system (BackupSystem, SelectiveBackup)
- Adoption flow (SmartOrchestrator)
- Upgrade flow (MigrationEngine)
- File system utilities (fs-extra)

---

## 8. Risks and Mitigations

### Risk 1: User has custom .sce rules

**Mitigation**: 
- Preserve all user rules
- Only add/update .sce-related rules
- Use comments to mark sce-managed section

### Risk 2: .gitignore syntax errors

**Mitigation**:
- Validate syntax before writing
- Create backup before modification
- Provide rollback on error

### Risk 3: User doesn't want auto-fix

**Mitigation**:
- Provide `--skip-gitignore-fix` flag
- Clear messaging about what will happen
- Easy rollback with backup

---

**Version**: 1.0  
**Created**: 2026-01-30  
**Status**: Draft
