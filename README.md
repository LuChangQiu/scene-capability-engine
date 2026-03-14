# SCE - Scene Capability Engine

[![npm version](https://badge.fury.io/js/scene-capability-engine.svg)](https://badge.fury.io/js/scene-capability-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**SCE is a scene-governed execution and governance engine for AI-native software delivery.**
It turns open-ended agent work into a controlled path from `goal -> scene -> spec -> task -> patch -> verify -> release`.

English | [简体中文](README.zh.md)

---

## What SCE Solves

AI agents can generate code quickly, but they also drift, over-create context, lose execution history, and hide risky decisions inside long sessions.

SCE provides the missing control layer:

- `Scene-governed context`: one primary session per scene, many specs per scene, many tasks per spec.
- `Spec-first execution`: requirements, design, tasks, and gates stay attached to the work, not buried in chat history.
- `Bounded autonomous delivery`: agents can run `close-loop`, `close-loop-program`, and `close-loop-controller` with retry, fallback, and governance policies.
- `Recoverable local history`: timeline snapshots, task refs, and SQLite-backed state keep work recoverable even before Git push.
- `Release-grade governance`: validation gates, handoff evidence, git management checks, and errorbook-driven learning prevent silent regressions.

---

## Core Model

SCE organizes agent work using one stable hierarchy:

- `session -> scene -> spec -> task -> event`
- `scene` is the continuity boundary
- `spec` is the governed work package
- `task` is the smallest user-facing execution unit
- `event` remains the raw audit stream behind the task view

This gives you a predictable way to manage long-running agent work without relying on fragile chat context alone.

---

## Major Capabilities

### 1. Scene + Spec Governance
- Automatic goal intake and spec binding/creation during `studio plan`
- Scene portfolio governance for existing and new specs
- Scene/spec/task contracts stored under `.sce/`
- Historical spec-scene backfill for older projects

### 2. Studio Execution Flow
- `studio plan -> generate -> apply -> verify -> release`
- Structured task stream for frontend or IDE integration
- Task refs (`SS.PP.TT`) for lookup and rerun
- Auth lease model for protected write operations

### 3. Autonomous Delivery
- `sce auto close-loop`
- `sce auto close-loop-batch`
- `sce auto close-loop-program`
- `sce auto close-loop-controller`
- Built-in retry, fallback-chain, governance replay, and anomaly-aware adaptation

### 4. Problem Closure and Errorbook
- Problem-domain map, chain, contract, and closure gate
- Incident staging before promotion to the long-term errorbook
- Local + registry-backed errorbook workflow
- Default rule: after repeated failed attempts, debug evidence is required

### 5. Local Timeline and SQLite State
- Timeline save/list/show/restore/push commands
- SQLite-backed task/event/session state
- Deterministic task references and rerun support
- File-to-SQLite migration and reconciliation tooling

### 6. Capability and Scene Assetization
- Scene/capability inventory and governance views
- Capability extraction, evaluation, and publication workflow
- Scene runtime and ontology-oriented execution support
- Moqui-oriented capability validation and handoff baselines

---

## Quick Start

### Install
```bash
npm install -g scene-capability-engine
```

### Adopt into a project
```bash
sce adopt
```

### Start a scene-governed workflow
```bash
sce studio plan --scene scene.demo --from-chat session-demo --goal "bootstrap first feature" --json
sce spec bootstrap --name 01-00-first-feature --scene scene.demo --non-interactive
sce spec pipeline run --spec 01-00-first-feature --scene scene.demo
```

### Run autonomous delivery
```bash
sce auto close-loop "deliver customer + order + inventory baseline"
```

---

## Recommended Usage Paths

### Feature Delivery
```bash
sce studio plan --scene scene.customer-order --from-chat session-20260308 --goal "optimize checkout" --json
sce spec bootstrap --name 02-00-checkout-optimization --scene scene.customer-order --non-interactive
sce spec gate run --spec 02-00-checkout-optimization --scene scene.customer-order --json
```

### Program-Scale Autonomous Delivery
```bash
sce auto close-loop-program "stabilize order lifecycle and release governance" --program-govern-until-stable --json
```

### Timeline Safety
```bash
sce timeline save --summary "before risky refactor"
sce timeline list --limit 20
sce timeline restore <snapshot-id>
```

### Protected Write Flow
```bash
sce auth grant --scope studio:* --reason "apply approved patch" --auth-password <password> --json
sce auth status --json
```

---

## Default Governance Behavior

SCE is opinionated by default.

- `studio plan` runs intake and scene/spec governance unless policy explicitly allows bypass.
- When business scene/module/page/entity context is missing, SCE must route to clarification first; unknown business scope must not be turned into blanket disable.
- `verify` and `release` enforce problem-closure and related gates when a spec is bound.
- Autonomous program execution applies gate evaluation, fallback-chain logic, governance replay, and auto-remediation.
- Co-work baseline is enabled by default: initialized/adopted SCE projects provision `.sce/config/multi-agent.json` with `enabled=true`, while the central coordinator stays opt-in.
- State persistence prefers SQLite, not ad hoc local caches.
- Oversized source files must trigger periodic refactor assessment; SCE recommends project-specific thresholds, with `2000 / 4000 / 10000` as the default source-file fallback.
- Release validation defaults to integration test coverage via `npm run test:release` for faster publish feedback.

---

## Key Integration Points

For IDEs, AI shells, or custom frontends, the most important SCE surfaces are:

- `sce studio plan|generate|apply|verify|release`
- `sce studio events --openhands-events <path>`
- `sce task ref|show|rerun`
- `sce timeline save|list|show|restore`
- `sce capability inventory`
- `sce auth grant|status|revoke`
- SQLite state at `.sce/state/sce-state.sqlite`

MagicBall-specific integration surfaces now also include:

- `sce app bundle list|show|register`
- `sce app registry status|configure|sync*`
- `sce app runtime show|releases|install|activate`
- `sce app engineering show|attach|hydrate|activate`
- `sce mode application|ontology|engineering home`
- `sce pm requirement|tracking|planning|change|issue ... --json`
- `sce ontology er|br|dl ... --json`
- `sce ontology triad summary --json`
- `sce assurance resource|logs|backup|config ... --json`

Demo remote registries:
- `magicball-app-bundle-registry`
- `magicball-app-service-catalog`
- demo app key: `customer-order-demo`

---

## Documentation

Start here:

- [Quick Start](docs/quick-start.md)
- [Quick Start with AI Tools](docs/quick-start-with-ai-tools.md)
- [Command Reference](docs/command-reference.md)
- [Autonomous Control Guide](docs/autonomous-control-guide.md)
- [Scene Runtime Guide](docs/scene-runtime-guide.md)
- [Multi-Agent Coordination Guide](docs/multi-agent-coordination-guide.md)
- [Errorbook Registry Guide](docs/errorbook-registry.md)
- [Documentation Hub](docs/README.md)

Moqui and capability-focused docs:

- [Moqui Template Core Library Playbook](docs/moqui-template-core-library-playbook.md)
- [Moqui Standard Rebuild Guide](docs/moqui-standard-rebuild-guide.md)
- [SCE Capability Matrix Roadmap](docs/sce-capability-matrix-roadmap.md)

---

## Community

- [GitHub Discussions](https://github.com/heguangyong/scene-capability-engine/discussions)
- [GitHub Issues](https://github.com/heguangyong/scene-capability-engine/issues)

<img src="docs/images/wechat-qr.png" width="200" alt="WeChat Group QR Code">

Scan the QR code and note `sce` to join the WeChat group.

---

## License

MIT. See [LICENSE](LICENSE).

---

**Version**: 3.6.51
**Last Updated**: 2026-03-15
