# Document Governance Guide

> Automated document lifecycle management for sce projects

---

**Version**: 1.42.0  
**Last Updated**: 2026-01-24  
**Audience**: All Users  
**Estimated Time**: 15 minutes

---

## Overview

The **Document Governance System** automatically enforces document lifecycle management rules in your sce project. It helps you maintain clean, well-organized documentation by detecting violations, cleaning up temporary files, validating structure, and organizing artifacts.

### What is Document Governance?

Document governance ensures your project follows these rules:

1. **Root Directory** - Only 4 markdown files allowed: `README.md`, `README.zh.md`, `CHANGELOG.md`, `CONTRIBUTING.md`
2. **Spec Structure** - Each Spec must have `requirements.md`, `design.md`, `tasks.md`
3. **Artifact Organization** - Spec artifacts must be in subdirectories, except approved Spec-root metadata such as `requirements.md`, `design.md`, `tasks.md`, and `collaboration.json`
4. **No Temporary Files** - Temporary documents (like `*-SUMMARY.md`, `SESSION-*.md`) must be deleted after use

### Why Use Document Governance?

- ✅ **Maintain Clean Structure** - Prevent document clutter
- ✅ **Enforce Standards** - Consistent documentation across projects
- ✅ **Automate Cleanup** - Remove temporary files automatically
- ✅ **Prevent Violations** - Git hooks block non-compliant commits
- ✅ **Track Compliance** - Statistics and reports over time

---

## Quick Start

### 1. Check Your Project's Compliance

```bash
sce docs diagnose
```

**Output:**
```
🔥 Document Governance Diagnostic

⚠️  Found 3 violation(s)

Root Violations (2)
  ❌ /project/MVP-PLAN.md
     Unexpected markdown file in root directory
     → Move to appropriate Spec or delete if temporary
  
  ❌ /project/SESSION-2024-01-20.md
     Temporary document should be deleted
     → Delete this file (temporary session notes)

Spec Violations (1)
  ⚠️  /project/.sce/specs/01-00-user-login/analysis-report.md
     Artifact not in subdirectory
     → Move to reports/ subdirectory

💡 Recommended Actions
  • Run 'sce docs cleanup' to remove temporary files
  • Run 'sce docs archive --spec 01-00-user-login' to organize artifacts
```

### 2. Clean Up Temporary Files

```bash
# Preview what would be deleted
sce docs cleanup --dry-run

# Actually delete temporary files
sce docs cleanup
```

### 3. Organize Spec Artifacts

```bash
# Preview what would be moved
sce docs archive --spec 01-00-user-login --dry-run

# Actually move artifacts to subdirectories
sce docs archive --spec 01-00-user-login
```

### 4. Validate Structure

```bash
# Validate root directory
sce docs validate

# Validate all Specs
sce docs validate --all

# Validate specific Spec
sce docs validate --spec 01-00-user-login
```

### 5. Prevent Future Violations

```bash
# Install Git pre-commit hook
sce docs hooks install

# Now commits will be blocked if violations exist
git commit -m "Add feature"
# → Validation runs automatically
```

---

## Commands Reference

### `sce docs diagnose`

Scan your project for document violations.

**Usage:**
```bash
sce docs diagnose
```

**What it checks:**
- Root directory for non-allowed markdown files
- Root directory for temporary documents
- Spec directories for missing required files
- Spec directories for misplaced artifacts outside approved Spec-root metadata
- Spec directories for temporary documents

**Output:**
- List of all violations with locations
- Severity level (error, warning, info)
- Specific recommendations for each violation
- Summary statistics

**Exit codes:**
- `0` - Project is compliant
- `1` - Violations found

**Example:**
```bash
$ sce docs diagnose

🔥 Document Governance Diagnostic

✅ Project is compliant
All documents follow the lifecycle management rules.
```

---

### `sce docs cleanup`

Remove temporary documents from your project.

**Usage:**
```bash
sce docs cleanup [options]
```

**Options:**
- `--dry-run`, `--dry` - Preview without deleting
- `--interactive`, `-i` - Prompt for each file
- `--spec <name>` - Only clean specific Spec

**What it removes:**
- Files matching temporary patterns:
  - `*-SUMMARY.md`
  - `SESSION-*.md`
  - `*-COMPLETE.md`
  - `TEMP-*.md`
  - `WIP-*.md`
  - `MVP-*.md`

**Examples:**

**Preview cleanup:**
```bash
$ sce docs cleanup --dry-run

🔥 Cleanup Preview (Dry Run)

Would delete 3 file(s):

  🗑️  /project/MVP-PLAN.md
  🗑️  /project/SESSION-2024-01-20.md
  🗑️  /project/.sce/specs/01-00-user-login/TEMP-notes.md

Run without --dry-run to actually delete these files
```

**Interactive cleanup:**
```bash
$ sce docs cleanup --interactive

Delete /project/MVP-PLAN.md? (y/n): y
✓ Deleted

Delete /project/SESSION-2024-01-20.md? (y/n): n
✗ Skipped

Deleted 1 file(s)
```

**Clean specific Spec:**
```bash
$ sce docs cleanup --spec 01-00-user-login

🔥 Cleanup Complete

Deleted 1 file(s):
  🗑️  .sce/specs/01-00-user-login/TEMP-notes.md

✅ Cleanup completed successfully
```

**Exit codes:**
- `0` - Cleanup successful
- `1` - Cleanup completed with errors

---

### `sce docs validate`

Validate document structure against governance rules.

**Usage:**
```bash
sce docs validate [options]
```

**Options:**
- `--spec <name>` - Validate specific Spec
- `--all` - Validate all Specs

**What it validates:**
- Root directory has only allowed markdown files
- Spec directories have required files (requirements.md, design.md, tasks.md)
- Spec root contains only approved metadata files plus governed subdirectories
- Spec subdirectories follow naming conventions
- No misplaced artifacts

**Examples:**

**Validate root directory:**
```bash
$ sce docs validate

🔥 Document Structure Validation

✅ Validation passed
All document structures are compliant.
```

**Validate with errors:**
```bash
$ sce docs validate --all

🔥 Document Structure Validation

❌ 2 error(s):

  ❌ .sce/specs/02-00-api-feature/requirements.md
     Missing required file: requirements.md
     → Create requirements.md in 02-00-api-feature

  ❌ /project/NOTES.md
     Unexpected markdown file in root directory
     → Move to appropriate location or delete if temporary

⚠️  1 warning(s):

  ⚠️  .sce/specs/01-00-user-login/script.js
     Artifact not in subdirectory
     → Move to appropriate subdirectory (reports, scripts, tests, results, docs)
```

**Exit codes:**
- `0` - Validation passed
- `1` - Validation failed

---

### `sce docs archive`

Organize Spec artifacts into proper subdirectories.

**Usage:**
```bash
sce docs archive --spec <spec-name> [options]
```

**Options:**
- `--spec <name>` - **Required** - Spec to archive
- `--dry-run`, `--dry` - Preview without moving

**What it does:**
- Identifies unorganized files in Spec directory
- Determines appropriate subdirectory based on file type:
  - **scripts/** - `.js`, `.py`, `.sh`, files with "script" in name
  - **reports/** - Files with "report", "analysis", "summary" in name
  - **tests/** - `.test.js`, `.spec.js`, files with "test" in name
  - **results/** - Files with "result", "output" in name
  - **docs/** - Other documentation files
- Creates subdirectories if they don't exist
- Moves files to appropriate locations

**Examples:**

**Preview archive:**
```bash
$ sce docs archive --spec 01-00-user-login --dry-run

🔥 Archive Preview (Dry Run)

Would move 3 file(s):

  📦 analysis-report.md
     → .sce/specs/01-00-user-login/reports/analysis-report.md
  
  📦 test-script.js
     → .sce/specs/01-00-user-login/scripts/test-script.js
  
  📦 implementation-guide.md
     → .sce/specs/01-00-user-login/docs/implementation-guide.md

Run without --dry-run to actually move these files
```

**Actually archive:**
```bash
$ sce docs archive --spec 01-00-user-login

🔥 Archive Complete

Moved 3 file(s):
  📦 analysis-report.md → reports/analysis-report.md
  📦 test-script.js → scripts/test-script.js
  📦 implementation-guide.md → docs/implementation-guide.md

✅ Archive completed successfully
```

**Exit codes:**
- `0` - Archive successful
- `1` - Archive completed with errors
- `2` - Invalid arguments (missing --spec)

---

### `sce docs hooks`

Manage Git hooks for document governance.

**Usage:**
```bash
sce docs hooks <action>
```

**Actions:**
- `install` - Install pre-commit hook
- `uninstall` - Remove pre-commit hook
- `status` - Check if hooks are installed

**What the hook does:**
- Runs `sce docs validate` before each commit
- Blocks commit if violations are found
- Shows violations and how to fix them
- Can be bypassed with `git commit --no-verify`

**Examples:**

**Install hooks:**
```bash
$ sce docs hooks install

🔧 Installing document governance hooks...

✅ Pre-commit hook installed successfully
   Backup created at: .git/hooks/pre-commit.backup

The pre-commit hook will now validate documents before each commit.
To bypass validation, use: git commit --no-verify
```

**Check status:**
```bash
$ sce docs hooks status

🔍 Checking Git hooks status...

✅ Document governance hooks are installed
   Pre-commit validation is active
```

**Uninstall hooks:**
```bash
$ sce docs hooks uninstall

🔧 Uninstalling document governance hooks...

✅ Pre-commit hook removed successfully
```

**Hook in action:**
```bash
$ git commit -m "Add feature"

Running document governance validation...

❌ Validation failed - commit blocked

Found 2 violation(s):
  • /project/TEMP-notes.md - Temporary file in root
  • .sce/specs/01-00-user-login/script.js - Misplaced artifact

Fix violations and try again, or use --no-verify to bypass.

Run 'sce docs diagnose' for details.
```

**Exit codes:**
- `0` - Operation successful
- `1` - Operation failed

---

### `sce docs config`

Display or modify document governance configuration.

**Usage:**
```bash
sce docs config [options]
```

**Options:**
- `--set <key> <value>` - Set configuration value
- `--reset` - Reset to defaults

**Configuration keys:**
- `root-allowed-files` - Allowed markdown files in root
- `spec-allowed-root-files` - Allowed files at Spec root before artifact warnings apply
- `spec-subdirs` - Recognized Spec subdirectories
- `temporary-patterns` - Patterns for temporary files

**Examples:**

**Display configuration:**
```bash
$ sce docs config

⚙️  Document Governance Configuration

Root Allowed Files:
  • README.md
  • README.zh.md
  • CHANGELOG.md
  • CONTRIBUTING.md

Spec Subdirectories:
  • reports
  • scripts
  • tests
  • results
  • docs

Spec Allowed Root Files:
  • requirements.md
  • design.md
  • tasks.md
  • collaboration.json

Temporary Patterns:
  • *-SUMMARY.md
  • SESSION-*.md
  • *-COMPLETE.md
  • TEMP-*.md
  • WIP-*.md
  • MVP-*.md

Configuration file: .sce/config/docs.json
To modify: sce docs config --set <key> <value>
To reset: sce docs config --reset
```

**Set configuration:**
```bash
$ sce docs config --set root-allowed-files "README.md,CUSTOM.md,LICENSE.md"

✅ Configuration updated: root-allowed-files
   New value: README.md, CUSTOM.md, LICENSE.md
```

**Reset configuration:**
```bash
$ sce docs config --reset

⚠️  Resetting configuration to defaults...

✅ Configuration reset to defaults
   Run "sce docs config" to view current configuration
```

**Exit codes:**
- `0` - Operation successful
- `1` - Operation failed
- `2` - Invalid arguments

---

### `sce docs stats`

Display document compliance statistics.

**Usage:**
```bash
sce docs stats
```

**What it shows:**
- Total governance tool executions
- Executions by tool (diagnostic, cleanup, validation, archive)
- Total violations found over time
- Violations by type
- Cleanup actions taken
- Archive actions taken
- Errors encountered

**Example:**
```bash
$ sce docs stats

📊 Document Compliance Statistics

Summary:
  • Total Executions: 15
  • Total Violations Found: 23
  • Total Cleanup Actions: 12
  • Total Archive Actions: 8
  • Total Errors: 1

Executions by Tool:
  • diagnostic: 5
  • cleanup: 4
  • validation: 3
  • archive: 3

Violations by Type:
  • root_violation: 10
  • misplaced_artifact: 8
  • temporary_document: 5

Recent Activity:
  • 2024-01-24: Cleaned 3 files
  • 2024-01-23: Found 5 violations
  • 2024-01-22: Archived 4 files
```

**Exit codes:**
- `0` - Always successful

---

### `sce docs report`

Generate a comprehensive compliance report.

**Usage:**
```bash
sce docs report
```

**What it generates:**
- Markdown report with all statistics
- Violations over time
- Cleanup actions over time
- Recent executions with details
- Saved to `.sce/reports/document-compliance-{date}.md`

**Example:**
```bash
$ sce docs report

✅ Compliance report generated
   Saved to: .sce/reports/document-compliance-2024-01-24.md
```

**Report contents:**
```markdown
# Document Compliance Report

**Generated:** 2024-01-24T10:30:00.000Z

## Summary
- **Total Executions:** 15
- **Total Violations Found:** 23
- **Total Cleanup Actions:** 12
...

## Violations by Type
| Type | Count |
|------|-------|
| root_violation | 10 |
| misplaced_artifact | 8 |
...
```

**Exit codes:**
- `0` - Report generated successfully

---

## Best Practices

### Daily Workflow

**1. Start of day - Check compliance:**
```bash
sce docs diagnose
```

**2. Before committing - Validate:**
```bash
sce docs validate --all
```

**3. End of feature - Clean up:**
```bash
sce docs cleanup
sce docs archive --spec your-spec
```

### Spec Lifecycle

**When creating a Spec:**
```bash
# 1. Create Spec
sce spec bootstrap --name 01-00-new-feature --non-interactive

# 2. Verify structure
sce docs validate --spec 01-00-new-feature
```

**During development:**
```bash
# Keep artifacts organized
sce docs archive --spec 01-00-new-feature --dry-run
# Review what would be moved, then:
sce docs archive --spec 01-00-new-feature
```

**When completing a Spec:**
```bash
# 1. Clean up temporary files
sce docs cleanup --spec 01-00-new-feature

# 2. Organize all artifacts
sce docs archive --spec 01-00-new-feature

# 3. Validate final structure
sce docs validate --spec 01-00-new-feature
```

### Team Collaboration

**Project setup:**
```bash
# 1. Install hooks for all team members
sce docs hooks install

# 2. Configure project-specific rules (if needed)
sce docs config --set root-allowed-files "README.md,README.zh.md,CHANGELOG.md,CONTRIBUTING.md,LICENSE.md"
```

**Code review:**
```bash
# Check compliance before reviewing
sce docs diagnose

# Generate report for team
sce docs report
```

### Automation

**CI/CD Integration:**
```yaml
# .github/workflows/document-governance.yml
name: Document Governance

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install -g scene-capability-engine
      - run: sce docs diagnose
      - run: sce docs validate --all
```

**Pre-commit hook (automatic):**
```bash
# Install once
sce docs hooks install

# Now every commit is validated automatically
git commit -m "Add feature"
# → Validation runs automatically
```

---

## Configuration

### Default Configuration

The default configuration is:

```json
{
  "rootAllowedFiles": [
    "README.md",
    "README.zh.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md"
  ],
  "specAllowedRootFiles": [
    "requirements.md",
    "design.md",
    "tasks.md",
    "collaboration.json"
  ],
  "specSubdirs": [
    "reports",
    "scripts",
    "tests",
    "results",
    "docs"
  ],
  "temporaryPatterns": [
    "*-SUMMARY.md",
    "SESSION-*.md",
    "*-COMPLETE.md",
    "TEMP-*.md",
    "WIP-*.md",
    "MVP-*.md"
  ]
}
```

### Customizing Configuration

**Add custom allowed files:**
```bash
sce docs config --set root-allowed-files "README.md,README.zh.md,CHANGELOG.md,CONTRIBUTING.md,LICENSE.md,SECURITY.md"
```

**Allow additional Spec-root metadata:**
```bash
sce docs config --set spec-allowed-root-files "requirements.md,design.md,tasks.md,collaboration.json"
```

**Add custom subdirectories:**
```bash
sce docs config --set spec-subdirs "reports,scripts,tests,results,docs,diagrams,examples"
```

**Add custom temporary patterns:**
```bash
sce docs config --set temporary-patterns "*-SUMMARY.md,SESSION-*.md,*-COMPLETE.md,TEMP-*.md,WIP-*.md,MVP-*.md,DRAFT-*.md"
```

### Configuration File Location

Configuration is stored in `.sce/config/docs.json`

You can also edit this file directly:

```json
{
  "rootAllowedFiles": ["README.md", "CUSTOM.md"],
  "specAllowedRootFiles": ["requirements.md", "design.md", "tasks.md", "collaboration.json"],
  "specSubdirs": ["reports", "scripts", "custom"],
  "temporaryPatterns": ["*-TEMP.md"]
}
```

---

## Troubleshooting

See the [Troubleshooting Guide](troubleshooting.md#document-governance-issues) for common issues and solutions.

### Quick Fixes

**"Permission denied" errors:**
```bash
# Check file permissions
ls -la .sce/

# Fix if needed
chmod -R u+w .sce/
```

**"Not a git repository" (for hooks):**
```bash
# Initialize git first
git init

# Then install hooks
sce docs hooks install
```

**"Configuration file corrupted":**
```bash
# Reset to defaults
sce docs config --reset
```

**"Cleanup not removing files":**
```bash
# Check if files match temporary patterns
sce docs diagnose

# Use interactive mode to confirm
sce docs cleanup --interactive
```

---

## Related Documentation

- **[Spec Workflow Guide](spec-workflow.md)** - Understanding Specs
- **[Command Reference](command-reference.md)** - All sce commands
- **[Troubleshooting Guide](troubleshooting.md)** - Common issues
- **[Quick Start Guide](quick-start.md)** - Getting started

---

## Summary

**Document Governance Commands:**
- `sce docs diagnose` - Find violations
- `sce docs cleanup` - Remove temporary files
- `sce docs validate` - Check structure
- `sce docs archive` - Organize artifacts
- `sce docs hooks` - Manage Git hooks
- `sce docs config` - Configure rules
- `sce docs stats` - View statistics
- `sce docs report` - Generate report

**Quick Workflow:**
```bash
# 1. Check compliance
sce docs diagnose

# 2. Fix violations
sce docs cleanup
sce docs archive --spec your-spec

# 3. Validate
sce docs validate --all

# 4. Prevent future violations
sce docs hooks install
```

**Start using document governance:** 🚀
```bash
sce docs diagnose
```

---

**Version**: 1.42.0  
**Last Updated**: 2026-01-24

