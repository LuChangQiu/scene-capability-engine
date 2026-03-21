# Project Development Guide

> **AI Tools: Read this first!** This project follows Spec-driven development methodology powered by sce (Scene Capability Engine).

---

## 🎯 How This Project Works

This project uses **Spec-driven development** - a structured approach where:
- Every feature starts with a **Spec** (requirements + design + tasks)
- All work is tracked and documented
- AI tools help implement features according to Specs

**Your role as AI:**
- When user requests a feature → Check if Spec exists, if not, help create one
- When implementing → Follow the Spec's requirements and design
- When stuck → Read the Spec documents for context
- When business scene/module/page/entity is unclear → Clarify scope first; do not replace missing understanding with blanket disable
- Track progress by updating task status

---

## 🚀 sce Capabilities

**IMPORTANT**: After installing or updating sce, read this section to understand all available capabilities. Using the right tool for the job ensures efficient, high-quality development.

### Core: Spec-Driven Development
- `sce adopt` — Initialize sce in a project (creates `.sce/` structure)
- `sce create-spec <name>` — Create a new Spec (requirements + design + tasks)
- `sce status` — Show project status and Spec progress
- `sce workflows` — List available Specs and workflows
- `sce context export <spec-name>` — Export Spec context for AI consumption
- `sce prompt generate <spec> <task>` — Generate task-specific prompt

### Task Management
- `sce task claim <spec> <task-id>` — Claim a task for execution
- `sce task list <spec>` — List claimed tasks
- Task status tracking in `tasks.md`: `[ ]` not started, `[-]` in progress, `[x]` completed

### Spec Locking (Multi-User)
- `sce lock acquire <spec>` — Lock a Spec to prevent conflicts
- `sce lock release <spec>` / `sce unlock <spec>` — Release lock
- `sce lock status` — Check lock status
- `sce lock cleanup` — Remove stale locks (24h timeout)
- `sce lock whoami` — Show machine identifier

### Workspace Management
- `sce workspace create/list/switch/info/remove` — Manage multiple sce projects
- Global state: `~/.sce/workspace-state.json`

### Environment Configuration
- `sce env list/switch/info/register/unregister/rollback/verify/run` — Multi-environment management
- Automatic backup before each switch, instant rollback support

### Multi-Repository Management
- `sce repo init [--nested]` — Auto-discover Git repositories
- `sce repo status [--verbose]` — Status of all repositories
- `sce repo exec "<command>"` — Execute command across all repos
- `sce repo health` — Check repository health

### Spec-Level Collaboration
- `sce collab init/status/assign/verify/integrate/migrate` — Coordinate parallel Spec development
- Master Spec + Sub-Specs with dependency management
- Interface contracts for cross-Spec compatibility

### Multi-Agent Parallel Coordination
When multiple AI agents work on the same project simultaneously:
- **AgentRegistry** (`lib/collab`) — Agent lifecycle with heartbeat monitoring
- **TaskLockManager** (`lib/lock`) — File-based task mutual exclusion
- **TaskStatusStore** (`lib/task`) — Concurrent-safe tasks.md updates with retry
- **SteeringFileLock** (`lib/lock`) — Steering file write serialization
- **MergeCoordinator** (`lib/collab`) — Git branch isolation per agent
- **Coordinator** (`lib/collab`) — Central task assignment (optional)
- Config: `.sce/config/multi-agent.json` (default `enabled: true`; set `enabled: false` to opt out)
- If a project opts out with `enabled: false`, all components fall back to single-agent no-op behavior
- See `docs/multi-agent-coordination-guide.md` for full API reference

### Spec-Level Steering & Context Sync
Fourth steering layer (L4) and Spec lifecycle coordination for multi-agent scenarios:
- **SpecSteering** (`lib/steering`) — Per-Spec `steering.md` CRUD with template generation, Markdown ↔ structured object roundtrip
- **SteeringLoader** (`lib/steering`) — Unified L1-L4 four-layer steering loader with merged output
- **ContextSyncManager** (`lib/steering`) — Multi-agent CURRENT_CONTEXT.md maintenance with Spec progress table, SteeringFileLock-protected writes
- **SpecLifecycleManager** (`lib/collab`) — Spec state machine (planned → assigned → in-progress → completed → released) with auto-completion detection
- **SyncBarrier** (`lib/collab`) — Agent Spec-switch synchronization barrier (uncommitted changes check, steering reload)
- **Coordinator Integration** — `completeTask` auto-checks Spec completion; `assignTask` runs SyncBarrier
- If needed, a project can still opt out by setting `enabled: false`, which restores single-agent no-op behavior
- See `docs/multi-agent-coordination-guide.md` for full API reference

### Autonomous Control
- `sce auto create <description>` — Create and execute Spec autonomously
- `sce auto run <spec>` — Execute existing Spec tasks autonomously
- `sce auto status/resume/stop/config` — Manage autonomous execution
- Intelligent error recovery, checkpoint system, learning from history

### Agent Orchestrator — Multi-Agent Spec Execution
Automate parallel Spec execution via Codex CLI sub-agents (replaces manual multi-terminal workflow):
- `sce orchestrate run --specs "spec-a,spec-b,spec-c" --max-parallel 3` — Start multi-agent orchestration
- `sce orchestrate status` — View orchestration progress (per-Spec status, overall state)
- `sce orchestrate stop` — Gracefully stop all sub-agents
- **OrchestratorConfig** (`lib/orchestrator`) — Configuration management (agent backend, parallelism, timeout, retries) via `.sce/config/orchestrator.json`
- **BootstrapPromptBuilder** (`lib/orchestrator`) — Builds bootstrap prompts with Spec path, steering context, execution instructions
- **AgentSpawner** (`lib/orchestrator`) — Process manager for Codex CLI sub-agents with timeout detection, graceful termination (SIGTERM → SIGKILL)
- **StatusMonitor** (`lib/orchestrator`) — Codex JSON Lines event parsing, per-Spec status tracking, orchestration-level aggregation
- **OrchestrationEngine** (`lib/orchestrator`) — DAG-based dependency analysis, batch scheduling, parallel execution (≤ maxParallel), failure propagation, retry mechanism
- Prerequisites: Codex CLI installed, `CODEX_API_KEY` environment variable set
- 11 correctness properties verified via property-based testing

### Scene Runtime (Template Engine + Quality + ERP)
- **Template Engine**: `sce scene template-validate/resolve/render` — Variable schema, multi-file rendering, 3-layer inheritance
- **Package Registry**: `sce scene publish/unpublish/install/list/search/info/diff/version` — Local package management
- **Quality Pipeline**: `sce scene lint/score/contribute` — 10-category lint, quality scoring, one-stop publish
- **Ontology**: `sce scene ontology show/deps/validate/actions/lineage/agent-info` — Semantic relationship graph
- **Moqui ERP**: `sce scene connect/discover/extract` — ERP integration and template extraction
- **Registry Ops**: `sce scene deprecate/audit/owner/tag/lock/stats` — Advanced registry management

### Document Governance
- `sce docs diagnose/cleanup/validate/archive/hooks` — Document lifecycle management
- Automatic compliance checking and cleanup

### DevOps Integration
- `sce ops init/validate/audit/takeover/feedback` — Operations Spec management
- Progressive AI autonomy levels (L1-L5)

### Knowledge Management
- `sce knowledge init/add/list/search/show/delete/stats` — Personal knowledge base

---

## 📋 Development Workflow

### When User Asks You to Implement a Feature

**Step 1: Check if Spec exists**
```
Look in .sce/specs/ directory
```

**Step 2: If Spec exists**
- Read `requirements.md` - understand what to build
- Read `design.md` - understand how to build it
- Read `tasks.md` - see implementation steps
- Implement according to the Spec
- Update task status as you complete work

**Step 3: If no Spec exists**
- Suggest creating a Spec first
- Help user define requirements
- Help design the solution
- Break down into tasks
- Then implement

### When Working in Multi-Agent Mode

By default `.sce/config/multi-agent.json` is provisioned with `enabled: true`:
1. Register with AgentRegistry before starting work
2. Acquire task locks before modifying any task
3. Use TaskStatusStore for concurrent-safe tasks.md updates
4. Use SteeringFileLock when updating steering files
5. Deregister when done (auto-releases all locks)

---

## 📁 Project Structure

```
.sce/
├── README.md                  # This file - project development guide
├── specs/                     # All Specs live here
│   └── {spec-name}/           # Individual Spec
│       ├── requirements.md    # What we're building
│       ├── design.md          # How we'll build it
│       ├── tasks.md           # Implementation steps
│       ├── steering.md        # Spec-level steering (L4, multi-agent)
│       ├── lifecycle.json     # Spec lifecycle state (multi-agent)
│       └── locks/             # Task lock files (multi-agent)
├── steering/                  # Development rules (auto-loaded by AI)
│   ├── CORE_PRINCIPLES.md     # Core development principles
│   ├── ENVIRONMENT.md         # Project environment
│   ├── CURRENT_CONTEXT.md     # Current work context
│   └── RULES_GUIDE.md         # Rules index
├── config/                    # Configuration files
│   ├── multi-agent.json       # Multi-agent coordination config
│   ├── agent-registry.json    # Active agent registry
│   └── coordination-log.json  # Coordinator assignment log
└── tools/                     # Tool configurations
```

**Key files:**
- `.sce/steering/CORE_PRINCIPLES.md` - Development principles for this project
- `.sce/steering/CURRENT_CONTEXT.md` - What we're currently working on
- `.sce/specs/{spec-name}/` - Feature specifications

---

## 📖 What is a Spec?

A Spec is a complete feature definition with three parts:

### 1. requirements.md - WHAT we're building
- User stories, functional requirements, acceptance criteria

### 2. design.md - HOW we'll build it
- Architecture, component design, API design, technology choices

### 3. tasks.md - Implementation steps
- Ordered task list with dependencies and implementation notes
- Status: `- [ ]` Not started | `- [-]` In progress | `- [x]` Completed

---

## 💡 Working with This Project

### DO:
- ✅ Check for existing Specs before starting work
- ✅ Follow requirements and design in Specs
- ✅ Update task status as you work
- ✅ Read steering rules for project-specific guidelines
- ✅ Use task locks in multi-agent mode
- ✅ Run tests before marking tasks complete

### DON'T:
- ❌ Start implementing without understanding requirements
- ❌ Ignore the design document
- ❌ Create files in wrong locations (use Spec directories)
- ❌ Skip updating task status
- ❌ Modify tasks.md without locks in multi-agent mode

---

## 🔍 Finding Information

| Need | Where |
|------|-------|
| Feature requirements | `.sce/specs/{spec-name}/requirements.md` |
| Implementation design | `.sce/specs/{spec-name}/design.md` |
| What to work on | `.sce/specs/{spec-name}/tasks.md` |
| Project context | `.sce/steering/CURRENT_CONTEXT.md` |
| Development rules | `.sce/steering/CORE_PRINCIPLES.md` |
| Project status | `sce status` |
| Multi-agent setup | `.sce/config/multi-agent.json` |
| Full documentation | `docs/` directory |

---

**Project Type**: Spec-driven development  
**sce Version**: 3.6.63  
**Last Updated**: 2026-03-21
**Purpose**: Guide AI tools to work effectively with this project
