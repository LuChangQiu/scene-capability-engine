# Frequently Asked Questions (FAQ)

> Common questions about sce and Spec-driven development

---

**Version**: 1.42.0  
**Last Updated**: 2026-02-11  
**Audience**: All Users  
**Estimated Time**: 10 minutes

---

## Quick Navigation

- [General Questions](#general-questions)
- [Integration Questions](#integration-questions)
- [Workflow Questions](#workflow-questions)
- [Advanced Questions](#advanced-questions)
- [Comparison Questions](#comparison-questions)

---

## General Questions

### What is sce?

**sce** (Scene Capability Engine) is a context provider for AI-assisted development. It helps you structure your feature development using Specs (specifications) and provides that context to AI coding tools.

Think of it as a **bridge between your brain and AI tools** - you describe what you want to build in a structured way, and sce formats that information so AI tools can understand and implement it effectively.

---

### Why do I need sce?

**Without sce:**
```
You: "Build a user login feature"
AI: "Sure! Here's some code..." [generates generic code]
You: "No, I need JWT tokens and PostgreSQL"
AI: "Oh, let me rewrite..." [starts over]
```

**With sce:**
```
You: [Create Spec with requirements and design]
You: [Export context] "Implement task 1.1"
AI: [Reads your Spec] "Here's the code following your exact design..."
```

**Benefits:**
- ✅ AI understands your architecture
- ✅ Consistent code across features
- ✅ Built-in documentation
- ✅ Progress tracking
- ✅ Team collaboration

---

### Is sce only for AI development?

**No!** While sce is optimized for AI-assisted development, it's useful for any development:

**For AI development:**
- Provides structured context to AI tools
- Ensures AI follows your architecture
- Tracks AI-generated code

**For human development:**
- Organizes feature requirements
- Documents design decisions
- Tracks implementation progress
- Serves as project documentation

**For team development:**
- Shared understanding of features
- Clear task assignments
- Progress visibility
- Onboarding documentation

---

### Do I need to use AI IDE?

**No!** sce works with any AI tool:

- **AI IDE** - Native integration (fully automatic)
- **Claude Code** - Manual export (copy-paste context)
- **ChatGPT** - Manual export
- **Cursor** - Manual export
- **Windsurf** - Manual export or watch mode
- **VS Code + Copilot** - Manual export
- **Any AI tool** - Manual export

See [Integration Modes](integration-modes.md) for details.

---

### Is sce free?

**Yes!** sce is open source and free to use.

- **License:** MIT
- **Source code:** https://github.com/heguangyong/scene-capability-engine
- **No subscription** required
- **No usage limits**

---

### What's the difference between sce and [other tool]?

See [Comparison Questions](#comparison-questions) below.

---

## Integration Questions

### Which AI tools work with sce?

**All of them!** sce provides three integration modes:

**Native Integration** (automatic):
- AI IDE

**Manual Export** (copy-paste):
- Claude Code
- ChatGPT
- Cursor
- VS Code + Copilot
- Any AI tool that accepts text input

**Watch Mode** (auto-refresh):
- All tools above
- Best with: Windsurf, Cline (can execute commands)

See [Integration Modes Guide](integration-modes.md) for details.

---

### How do I use sce with Claude Code?

**Quick workflow:**

1. **Create Spec:**
```bash
sce spec bootstrap --name 01-00-user-login --non-interactive
# Edit requirements.md, design.md, tasks.md
```

2. **Export context:**
```bash
sce context export 01-00-user-login
```

3. **Copy to clipboard:**
```bash
# macOS
cat .sce/specs/01-00-user-login/context-export.md | pbcopy

# Windows
type .sce\specs\01-00-user-login\context-export.md | clip

# Linux
cat .sce/specs/01-00-user-login/context-export.md | xclip -selection clipboard
```

4. **Paste into Claude:**
```
[Paste context]

You: "Please implement task 1.1: Create AuthController"
```

See [Claude Guide](tools/claude-guide.md) for detailed instructions.

---

### Can I use sce with GitHub Copilot?

**Yes!** Two approaches:

**Approach 1: Manual export**
```bash
sce context export 01-00-user-login
# Reference context in code comments
```

**Approach 2: File references**
```javascript
// See requirements: .sce/specs/01-00-user-login/requirements.md
// See design: .sce/specs/01-00-user-login/design.md

class AuthController {
  // Copilot reads nearby files and suggests code
}
```

See [VS Code Guide](tools/vscode-guide.md) for details.

---

### What's the difference between the three integration modes?

| Mode | Automation | Setup | Best For |
|------|-----------|-------|----------|
| **Native** | Fully automatic | None | AI IDE users |
| **Manual Export** | Semi-manual | None | Quick start, any tool |
| **Watch Mode** | Auto-refresh | 5 minutes | Active development |

**Native Integration:**
- AI reads Specs directly
- No manual export needed
- Only works with AI IDE

**Manual Export:**
- You export context manually
- Copy-paste to AI tool
- Works with any AI tool

**Watch Mode:**
- Auto-exports when Specs change
- You still provide context to AI
- Works with any AI tool

See [Integration Modes Guide](integration-modes.md) for details.

---

## Workflow Questions

### How long does it take to create a Spec?

**Depends on feature complexity:**

**Simple feature** (5-10 minutes):
- Requirements: 2 minutes
- Design: 3 minutes
- Tasks: 2 minutes
- Example: Add a new API endpoint

**Medium feature** (20-30 minutes):
- Requirements: 5 minutes
- Design: 10 minutes
- Tasks: 5 minutes
- Example: User authentication system

**Complex feature** (1-2 hours):
- Requirements: 20 minutes
- Design: 40 minutes
- Tasks: 20 minutes
- Example: Multi-tenant data architecture

**Time investment pays off:**
- AI generates better code
- Fewer iterations needed
- Built-in documentation
- Easier maintenance

---

### Do I need to complete all three Spec files before coding?

**No!** You can iterate:

**Minimum viable Spec:**
```markdown
# requirements.md
- Basic user story
- Key acceptance criteria

# design.md
- High-level architecture
- Main components

# tasks.md
- First few tasks
```

**Then iterate:**
1. Implement first tasks
2. Learn from implementation
3. Refine requirements/design
4. Add more tasks
5. Repeat

**When to complete fully upfront:**
- Critical systems
- Team collaboration
- Well-understood features

**When to iterate:**
- Exploring new features
- Prototyping
- Learning new technologies

---

### How do I update a Spec after starting implementation?

**Just edit the files!**

```bash
# Edit any Spec file
vim .sce/specs/01-00-user-login/design.md

# If using watch mode, context auto-updates
# If using manual export, re-export:
sce context export 01-00-user-login
```

**Best practices:**
- ✅ Update Specs as you learn
- ✅ Keep Specs in sync with code
- ✅ Commit Spec changes to git
- ✅ Document why you changed design

**Specs are living documents** - they should evolve with your understanding.

---

### How do I track task progress?

**Update tasks.md manually:**

```markdown
# Before
- [ ] 1.1 Create AuthController
- [ ] 1.2 Create AuthService

# After completing 1.1
- [x] 1.1 Create AuthController
- [ ] 1.2 Create AuthService
```

**Check progress:**
```bash
sce status
```

**Output:**
```
Spec: 01-00-user-login
Progress: 1/2 tasks complete (50%)
- [x] 1.1 Create AuthController
- [ ] 1.2 Create AuthService
```

**With AI IDE:**
- AI updates tasks automatically
- No manual checkbox editing needed

---

### Can I use sce for bug fixes?

**Yes!** Create a Spec for the bug:

```bash
sce spec bootstrap --name 01-01-fix-login-timeout --non-interactive
```

**requirements.md:**
```markdown
# Bug: Login Timeout

## Problem
Users are logged out after 5 minutes instead of 30 minutes

## Root Cause
JWT token expiration set to 300 seconds instead of 1800 seconds

## Acceptance Criteria
- WHEN user logs in THEN token expires after 30 minutes
- WHEN token expires THEN user is redirected to login
```

**design.md:**
```markdown
# Fix: Update JWT expiration

## Changes
- Update AuthService.generateToken()
- Change expiresIn from '5m' to '30m'
- Add test for token expiration
```

**tasks.md:**
```markdown
- [ ] 1.1 Update AuthService.generateToken()
- [ ] 1.2 Update tests
- [ ] 1.3 Verify in staging
```

---

### Can I use sce for refactoring?

**Absolutely!** Specs are great for refactoring:

```bash
sce spec bootstrap --name 02-00-refactor-auth-module --non-interactive
```

**requirements.md:**
```markdown
# Refactor: Auth Module

## Goals
- Separate authentication from authorization
- Improve testability
- Reduce code duplication

## Acceptance Criteria
- WHEN refactoring is complete THEN all tests pass
- WHEN refactoring is complete THEN code coverage >= 80%
```

**design.md:**
```markdown
# Refactoring Plan

## Current Architecture
[Diagram of current structure]

## Target Architecture
[Diagram of desired structure]

## Migration Strategy
1. Create new AuthService
2. Migrate AuthController to use new service
3. Deprecate old service
4. Remove old service
```

---

## Advanced Questions

### Can I customize Spec templates?

**Yes!** sce uses templates from `.sce/templates/`:

```bash
# View current templates
ls .sce/templates/

# Edit templates
vim .sce/templates/requirements.md
vim .sce/templates/design.md
vim .sce/templates/tasks.md
```

**Example custom template:**
```markdown
# requirements.md template
# Feature: {{feature-name}}

## User Stories
- As a {{user-type}}, I want to {{action}}, so that {{benefit}}

## Acceptance Criteria
- WHEN {{condition}} THEN {{result}}

## Custom Section
- Security considerations
- Performance requirements
- Accessibility requirements
```

---

### Can I use sce with multiple projects?

**Yes!** Each project has its own sce installation:

```bash
# Project 1
cd ~/projects/project1
sce adopt
sce spec bootstrap --name 01-00-feature-a --non-interactive

# Project 2
cd ~/projects/project2
sce adopt
sce spec bootstrap --name 01-00-feature-b --non-interactive
```

**Each project has:**
- Own `.sce/` directory
- Own `sce.json` config
- Own Specs
- Own templates

---

### Can I share Specs with my team?

**Yes!** Specs are just markdown files:

**Via git:**
```bash
git add .sce/specs/01-00-user-login/
git commit -m "Add user login Spec"
git push
```

**Via export:**
```bash
# Export Spec as single file
sce context export 01-00-user-login

# Share context-export.md
```

**Team workflow:**
1. One person creates Spec
2. Team reviews requirements/design
3. Team members claim tasks
4. Everyone uses same Spec for context

---

### How do I handle large features?

**Break into multiple Specs:**

```bash
# Main feature
sce spec bootstrap --name 01-00-user-management --non-interactive

# Sub-features
sce spec bootstrap --name 01-01-user-registration --non-interactive
sce spec bootstrap --name 01-02-user-login --non-interactive
sce spec bootstrap --name 01-03-user-profile --non-interactive
sce spec bootstrap --name 01-04-password-reset --non-interactive
```

**Or use phases in tasks.md:**
```markdown
## Phase 1: Core Authentication
- [ ] 1.1 User registration
- [ ] 1.2 User login

## Phase 2: Profile Management
- [ ] 2.1 View profile
- [ ] 2.2 Edit profile

## Phase 3: Advanced Features
- [ ] 3.1 Password reset
- [ ] 3.2 Two-factor auth
```

---

### Can I use sce for non-code projects?

**Yes!** Specs work for any structured work:

**Documentation project:**
```bash
sce spec bootstrap --name 01-00-api-documentation --non-interactive
```

**Design project:**
```bash
sce spec bootstrap --name 02-00-ui-redesign --non-interactive
```

**Process improvement:**
```bash
sce spec bootstrap --name 03-00-ci-cd-pipeline --non-interactive
```

**Specs provide structure for any project** with requirements, design, and tasks.

---

## Comparison Questions

### sce vs. GitHub Issues

**GitHub Issues:**
- Track bugs and feature requests
- Discussion and collaboration
- Project management

**sce:**
- Structure feature implementation
- Provide context to AI tools
- Document design decisions

**Use both:**
- GitHub Issue: "Add user login feature"
- sce Spec: Detailed requirements, design, tasks for implementation

---

### sce vs. Jira/Linear

**Jira/Linear:**
- Project management
- Sprint planning
- Team coordination

**sce:**
- Feature specification
- AI context provider
- Implementation documentation

**Use both:**
- Jira ticket: "USER-123: Implement login"
- sce Spec: Technical specification for implementation

---

### sce vs. Confluence/Notion

**Confluence/Notion:**
- General documentation
- Knowledge base
- Team wiki

**sce:**
- Feature-specific documentation
- Structured format (requirements/design/tasks)
- AI-optimized context

**Use both:**
- Confluence: Architecture overview, team processes
- sce: Individual feature specifications

---

### sce vs. OpenAPI/Swagger

**OpenAPI/Swagger:**
- API documentation
- API contract
- API testing

**sce:**
- Full feature specification (not just API)
- Requirements and design rationale
- Implementation tasks

**Use both:**
- sce design.md: Include OpenAPI spec
- Generate OpenAPI from implementation
- Reference OpenAPI in sce Spec

---

### sce vs. ADRs (Architecture Decision Records)

**ADRs:**
- Document architectural decisions
- Explain why decisions were made
- Historical record

**sce:**
- Document feature implementation
- Provide context for AI
- Track implementation progress

**Use both:**
- ADR: "We chose PostgreSQL over MongoDB"
- sce Spec: "User login feature uses PostgreSQL"

---

## Related Documentation

- **[Quick Start Guide](quick-start.md)** - Get started with sce
- **[Integration Modes](integration-modes.md)** - How to use sce with AI tools
- **[Spec Workflow](spec-workflow.md)** - Understanding Specs
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

---

## Still Have Questions?

**Ask the community:**
- GitHub Discussions: https://github.com/heguangyong/scene-capability-engine/discussions
- Discord: [Join our Discord](https://discord.gg/sce)
- Twitter: [@sce_dev](https://twitter.com/sce_dev)

**Report issues:**
- GitHub Issues: https://github.com/heguangyong/scene-capability-engine/issues

**Contribute:**
- Contributing Guide: [CONTRIBUTING.md](../CONTRIBUTING.md)

---

**Version**: 1.42.0  
**Last Updated**: 2026-02-11

