# 331-poc 适配持续推进路线图（sce 侧）

> 范围：`scene-capability-engine` 侧围绕 331-poc handoff 的持续适配工作，不包含 331 业务实现本身。

## 已完成（本轮）

1. 新增 handoff 自动化命令：
   - `sce auto handoff plan`
   - `sce auto handoff queue`
2. 将 handoff manifest 解析为可执行阶段计划（precheck/spec validation/execution/observability）。
3. 将 handoff manifest 生成 close-loop-batch 目标队列（支持 dry-run、append、known-gaps 开关）。
4. 补齐单测覆盖（plan/queue/dry-run 分支）。
5. 更新命令参考与中英文文档入口。
6. 新增 `sce auto handoff run`：
   - 一条命令串行执行 `plan -> queue -> close-loop-batch -> observability`。
   - 支持 `--dry-run` 与失败自动中断。
7. 新增 handoff 结果归档：
   - 默认输出 `.sce/reports/handoff-runs/<session>.json`。
   - 汇总每个 spec 的执行状态与阻塞项。
8. 新增 handoff 门禁策略：
   - `--min-spec-success-rate`
   - `--max-risk-level`
   - `--require-ontology-validation`
9. 新增主从依赖批次执行：
   - 从 manifest `specs[].depends_on` 构建依赖拓扑批次。
   - `handoff run` 默认按依赖批次顺序执行 spec 集成目标。
10. 新增模板差异检测：
   - `sce auto handoff template-diff` 对比 manifest 模板与本地模板库。
11. 新增跨轮次回归分析：
   - `sce auto handoff regression` 对比相邻批次成功率/风险/失败目标/耗时变化。
   - `handoff run` 结果中自动附加 regression 摘要。
12. 新增断点续跑能力：
   - `sce auto handoff run --continue-from <session|latest|file>`。
   - 支持 `--continue-strategy auto|pending|failed-only`。
13. 新增 release evidence 自动归并：
   - `handoff run` 结束后自动将批次结果合并到 `.sce/reports/release-evidence/handoff-runs.json`。
   - 按 `session_id` 去重更新，失败时写 warning 不阻塞主流程。
14. 新增回归可视化报表增强：
   - `handoff regression` 输出增加 `risk_layers` 风险分层视图（low/medium/high/unknown）。
   - markdown 报表新增 `Trend Series` 与 `Risk Layer View`，支持多轮趋势快速审阅。
15. 新增 release evidence 趋势窗口快照：
   - `handoff run` 支持 `--release-evidence-window <n>`（默认 5）。
   - release evidence 自动写入 `latest_trend_window` 与每个 session 的 `trend_window`，支持发布包一键审阅。
16. 新增 release evidence 快速审阅命令：
   - `sce auto handoff evidence` 直接聚合当前批次 gate/ontology/regression/risk-layer 概览。
   - 支持 JSON/markdown 输出与 `--window` 会话窗口聚合。
17. 新增 release draft 自动生成：
   - `sce auto handoff evidence --release-draft <path>` 一次命令生成 evidence 审阅 markdown + release notes 草稿。
   - 草稿自动注入当前批次 gate/ontology/regression/risk-layer 摘要与证据路径。
18. 新增 CI 发布链路集成：
   - `release.yml` 在 tag 发布时自动尝试基于 `handoff-runs.json` 生成 release notes 草稿。
   - 若证据缺失或生成失败，自动回退到默认 CHANGELOG 引导文案，避免发布流水卡死。
19. 新增 release evidence 附件发布：
   - tag 发布时自动将 release notes 草稿、evidence 审阅 markdown、summary JSON 作为 GitHub Release 资产上传。
   - 无 evidence 时至少上传 fallback notes，保证发布资产结构稳定。
20. 新增可配置发布门禁（workflow 级）：
   - 支持通过 `SCE_RELEASE_*` 仓库变量配置 success rate/risk/ontology 阈值。
   - 支持 advisory（默认）与 enforce（阻断发布）两种模式，且门禁在 `npm publish` 前执行。
21. 新增 release gate 审计产物：
   - 每次 tag 发布生成 `release-gate-<tag>.json`，记录阈值、观测信号、违规项和判定结果。
   - `release-gate` 报告随 GitHub Release 资产一起发布，便于后续追溯。
22. 增强多 Agent 限流韧性：
   - 编排引擎在 429/RateLimit 错误重试时，支持解析 `Retry-After`/`try again in` 提示并抬升 backoff。
   - 减少服务端限流窗口内的无效重试与“卡死感”。
23. 新增 release gate 历史索引命令：
   - `sce auto handoff gate-index` 聚合 `release-gate-*.json` 为跨版本历史索引。
   - 支持与已有历史索引合并去重（按 tag/file），输出门禁通过率与风险分布聚合指标。
24. 发布流程自动产出门禁历史索引：
   - `release.yml` 在 gate 评估后自动执行 `handoff gate-index`，生成 `release-gate-history.json` 与当次 summary。
   - 两份索引产物随 GitHub Release 资产发布，便于对外审计与回放。
25. 发布流程支持跨版本历史增量：
   - `release.yml` 在构建索引前自动尝试下载上一版 Release 的 `release-gate-history.json`。
   - 当前 tag 发布时基于上一版历史做增量合并，持续积累趋势数据。
26. 发布说明自动注入门禁趋势摘要：
   - `release.yml` 在发布前将 `release-gate-history` 的近 5 版趋势追加到 Release Notes。
   - 发布页可直接看到 gate pass ratio、风险分布与近期版本轨迹。
27. 新增 gate-index Markdown 趋势卡片：
   - `sce auto handoff gate-index --markdown-out <path>` 直接产出可读趋势卡片。
   - 便于在 PR/Issue 中复用，降低历史门禁审阅成本。
28. 发布流程附带趋势卡片资产：
   - `release.yml` 自动生成并上传 `release-gate-history-<tag>.md`。
   - Release Notes 趋势段落附带卡片资产文件名，便于发布后检索。
29. Release Notes 资产链接增强：
   - 趋势段落自动生成 `release-gate-history` 相关资产的可点击下载链接。
   - 发布页可直接跳转趋势卡片/索引 JSON，无需手工查找资产列表。
30. 发布说明新增门禁漂移告警：
   - 自动检测连续 gate 失败、高风险占比过高、短期风险占比上升。
   - 在 Release Notes 中显式给出 drift alerts，提前暴露质量恶化趋势。
31. 漂移告警阈值参数化：
   - 支持通过 `SCE_RELEASE_DRIFT_*` 仓库变量调节 fail streak/high-risk share/delta 阈值。
   - 不同项目可按发布策略调整灵敏度，减少误报或漏报。
32. 漂移告警阻断模式：
   - 新增 `SCE_RELEASE_DRIFT_ENFORCE`，可在漂移告警触发时阻断发布。
   - 保留默认 advisory 模式，确保历史数据不足时不误阻断。
33. 漂移告警审计写回 gate 报告：
   - `release.yml` 将 drift 评估结果回写到 `release-gate-<tag>.json` 的 `drift` 字段。
   - 单一门禁产物同时覆盖 gate 与 drift 审计口径，便于回放。
34. gate-index 漂移趋势聚合：
   - `sce auto handoff gate-index` 聚合 `drift_alert_count/drift_blocked` 指标并输出 markdown 趋势。
   - 发布流程在 drift 合并后自动刷新一次 gate-index，确保当次 release 资产包含 drift 最新状态。
35. 治理默认评估接入 handoff 发布信号：
   - `sce auto governance stats` 默认读取 `release-gate-history.json`，将 gate/drift/scene-batch 信号纳入风险评估。
   - 治理健康输出新增 `health.release_gate` 快照，concerns/recommendations 自动给出 release 质量回归处置建议。
36. 治理 close-loop 轮次遥测接入发布信号：
   - `sce auto governance close-loop` 每轮输出 `release_gate_before/release_gate_after`，与 `risk_before/risk_after` 对齐。
   - 轮次级审计可直接追踪 release gate/drift/scene-batch 信号在治理动作前后的变化。
37. 治理会话统计聚合 release gate 轮次趋势：
   - `sce auto governance session stats` 新增 `release_gate` 聚合区块，覆盖 gate fail/drift alert/blocked 与通过率均值。
   - 会话统计输出同时汇总 `round_telemetry_observed/changed`，可量化治理轮次对发布质量信号的影响。
38. 治理 close-loop 接入 release gate 阻断语义：
   - `sce auto governance close-loop` 在 release gate/drift 信号异常时输出 `stop_reason=release-gate-blocked`。
   - 结果新增 `stop_detail` 与 `recommendations`，显式给出阻断原因与处置命令。
39. 治理 maintain 计划默认优先 release gate 修复：
   - `sce auto governance maintain` 在 release gate 阻断时优先产出 `release-gate-evidence-review` / `release-gate-scene-batch-remediate`。
   - 发布质量阻断先处理，再执行常规会话/内存清理动作。
40. handoff run 接入 release gate preflight 与失败摘要：
   - `sce auto handoff run` 默认输出 `release_gate_preflight`，在 precheck 阶段给出 release gate 阻断提示。
   - 失败结果新增 `failure_summary`，统一汇总 phase/gate/release-gate 阻断原因并联动推荐命令。
41. handoff run 增加 release gate 可选硬门禁：
   - 新增 `--require-release-gate-preflight`，可在生产场景将 release gate preflight 从 advisory 升级为 hard-fail。
   - 默认保持 advisory，避免对现有项目引入破坏性变更。
42. release draft/evidence review 纳入 preflight 与失败摘要信号：
   - `sce auto handoff evidence --format markdown` 新增 `Current Release Gate Preflight` 与 `Current Failure Summary`。
   - release notes draft 摘要新增 preflight 可用性、阻断状态、hard-gate 模式与失败高亮。
43. gate-index 趋势卡片纳入 preflight/hard-gate 聚合：
   - `sce auto handoff gate-index` 聚合 `release_gate_preflight_*` 指标并在 markdown 趋势卡片展示。
   - Recent entries 行新增 `preflight-blocked` / `hard-gate` 维度，便于跨版本定位阻断模式。
44. release workflow 漂移判定纳入 preflight/hard-gate 趋势：
   - `release.yml` 的 drift alert 增加 preflight blocked rate、hard-gate blocked streak、preflight unavailable streak 三类阈值。
   - drift 评估结果与 release notes 趋势摘要统一输出 preflight/hard-gate 指标，形成单一发布阻断口径。
45. release workflow 漂移口径抽离共享脚本：
   - 新增 `scripts/release-drift-signals.js` 统一计算 drift/preflight/hard-gate 信号。
   - release notes 生成与 drift gate 判定复用同一计算模块，减少规则分叉。
46. release drift fixture 回放样例：
   - 增加 `tests/fixtures/release-drift-history/*.json`，模拟阻断与健康两类 release history 摘要。
   - 单测覆盖共享脚本对 fixture 的告警输出，先行固化 workflow 级门禁口径。

## 已完成（本轮补齐）

1. release workflow drift 门禁补齐端到端 smoke 链路：
   - 新增 `scripts/release-drift-evaluate.js`，统一处理历史读取、阈值评估、gate report `drift` 写回、summary 输出与阻断退出码。
   - `release.yml` 的 Evaluate drift 步骤改为直接调用脚本，消除大段内联 heredoc，降低语法错误与维护成本。
   - 新增 `tests/unit/scripts/release-drift-evaluate.test.js` 覆盖 advisory/enforce/missing history/gate report 写回四类场景。
2. handoff 质量指标接入 governance 默认评估闭环：
   - `sce auto governance stats` 默认聚合 `.sce/reports/release-evidence/handoff-runs.json`，输出 `health.handoff_quality` 快照。
   - `risk/concerns/recommendations` 自动纳入 handoff 最新状态、gate、ontology、capability、preflight 阻断等信号。
   - `sce auto governance close-loop` 的阻断判断纳入 handoff 严重质量信号，统一通过 `stop_reason=release-gate-blocked` 回传处置语义。
   - `sce auto governance maintain` 在 handoff 质量阻断时新增 `release-gate-handoff-remediate` 建议动作。
3. release evidence 与治理视图合并：
   - `sce auto handoff evidence` 报告新增 `governance_snapshot`（risk/concerns/recommendations + release/handoff health）。
   - evidence markdown 与 release draft 同步输出 `Governance Snapshot` 区块，形成可发布的一体化治理审阅材料。
4. release workflow 独立治理快照资产化：
   - 新增 `scripts/release-governance-snapshot-export.js`，从 release evidence summary 提取 `governance_snapshot` 并导出独立 JSON/Markdown 资产。
   - `release.yml` 发布流程新增治理快照导出步骤，统一上传 `governance-snapshot-<tag>.json|.md` 供外部审计直接消费（无 summary 时也会生成占位资产，避免资产缺口）。
5. handoff 模板 profile 化与外部接入规范：
   - `sce auto handoff run` / `sce auto handoff capability-matrix` 新增 `--profile <default|moqui|enterprise>`，将策略默认值抽象为稳定 profile 契约，并允许显式参数覆盖。
   - 新增 `docs/handoff-profile-integration-guide.md`，对外发布 profile 默认策略、覆盖规则、manifest/evidence 要求及分阶段上线建议。

## 下一阶段（新）

主线增强项已收口（本轮完成）：

1. profile 化外部接入样例收敛：
   - 新增 `docs/starter-kit/handoff-profile-ci.sample.yml`。
   - 新增 profile 最小验收样本（manifest + evidence fixture）：
     - `tests/fixtures/handoff-profile-intake/default/*`
     - `tests/fixtures/handoff-profile-intake/moqui/*`
     - `tests/fixtures/handoff-profile-intake/enterprise/*`
   - 新增样本自动化校验：
     - `tests/unit/starter-kit/handoff-profile-intake-fixtures.test.js`
2. 发布资产审计一致性：
   - 新增 `scripts/release-asset-integrity-check.js`，默认阻断缺失/空资产。
   - `release.yml` 已接入资产完整性审计并发布 `release-asset-integrity-<tag>.json|.md`。

当前剩余增强任务：`0`
