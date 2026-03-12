# Capability Map（Spec-Centric 基线）

## 1. 盘点范围

本盘点覆盖以下能力族：

- `spec/create`
- `adopt`
- `docs`
- `lock`
- `collab`
- `orchestrate`
- `auto`
- `scene`

盘点来源：CLI `--help`、命令实现代码、当前项目 `.sce` 目录结构。

## 2. 命令面规模快照

- `scene` 子命令：约 `46`
- `orchestrate` 子命令：`4`
- `auto` 子命令：`7`
- `docs` 子命令：`10`
- `collab` 子命令：`9`

结论：能力增长重心明显偏向 `scene`，但 Spec 主线命令（bootstrap/pipeline/gate）仍不完整。

## 3. 能力矩阵

| 能力族 | 主命令 | 主要输入 | 主要输出 | 状态/配置落点 | 与 Spec 主线耦合 | 主要风险 |
|---|---|---|---|---|---|---|
| spec/create | `sce spec <name>` | `spec-name`, `--template` | 新建 spec 目录（默认不产三文档） | `.sce/specs/<spec>/` | 中 | 起步仍偏手工，质量不稳 |
| adopt | `sce adopt` | 项目根目录、模式参数 | `.sce` 基础结构 | `.sce/*` | 高 | 接管后缺少一键 bootstrap |
| docs | `sce docs diagnose/validate/archive` | spec 或全局扫描参数 | 合规报告、归档动作 | `.sce/config/docs.json` | 高 | 治理与执行链路尚未统一闭环 |
| lock | `sce lock acquire/release/status` | spec 名称、超时/原因 | 锁状态 | `.sce/specs/<spec>/locks/*` + `.sce/config/machine-id.json` | 高 | 只解决互斥，不保证流程收敛 |
| collab | `sce collab init/status/assign` | master/sub spec、依赖、实例 | 协作状态、依赖图 | `.sce/specs/<spec>/collaboration.json` | 高 | 协作状态与执行状态可能分叉 |
| orchestrate | `sce orchestrate run/status/stop` | specs、max-parallel | 批次执行结果 | `.sce/config/orchestration-status.json`, `.sce/config/orchestrator.json` | 中高 | 缺少 plan/watch/run-id 精细治理 |
| auto | `sce auto run/create/status` | spec、mode、配置 | 自动执行状态/日志 | `.sce/auto/config.json`, `.sce/auto/<spec>-state.json` | 中 | 自动执行与 tasks 真值可能漂移 |
| scene | `sce scene *` | manifest/spec/policy/registry | 计划、结果、评估、模板、包管理 | `.sce/templates/*`, `.sce/registry/*`, `.sce/config/scene-*`, spec 内 `custom/*` | 中 | 子系统强大但主线入口分散 |

## 4. 关键观察

1. **Spec 主线不闭环**：`spec` 仍以目录创建为主，不等于“可推进 spec”。
2. **状态源分散**：`collaboration.json`、`lifecycle.json`、`orchestration-status.json`、`auto/*-state.json` 并存，缺统一语义层。
3. **scene 功能密集**：覆盖模板、运行、评估、包管理、ERP 适配，但与 `requirements/design/tasks` 映射约束不够强。
4. **治理可见但未内嵌流程**：`docs` 已可诊断/归档，仍需与 pipeline/gate 强绑定。

## 5. 能力分类结论

- **主线能力（必须 Spec 对齐）**：`adopt`、`spec/create`、`docs`、`lock`
- **执行能力（需受主线驱动）**：`orchestrate`、`auto`、`scene`
- **协同治理能力**：`collab`、`docs`、`lock`

建议：后续实现一律以“是否提升 Golden Path 连贯性”作为准入标准。
