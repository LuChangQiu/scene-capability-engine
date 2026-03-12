# Convergence Roadmap（Spec-Centric 收敛路线图）

## 1. 基线指标（当前）

> 注：以下为本次调研阶段的可观测基线，用于后续对比。

- Spec 主线完整度：`adopt -> create -> execute` 可走通；`bootstrap/pipeline/gate` 缺口明显
- scene 子命令规模：`46`（能力强但入口复杂）
- 文档治理告警：`21`（均为既有 `.config.sce` 归档位置问题）
- Gate 命令可用性：`sce spec gate` 目前尚未实装

## 2. 三阶段路线

## 阶段 I（短期，1~2 个版本）

目标：补齐主线最短路径。

1. 落地 `109-00-spec-bootstrap-wizard`
2. 落地 `110-00-spec-workflow-pipeline`
3. 落地 `111-00-spec-gate-standardization` 最小可用版

交付判据：

- 新用户从 adopt 到可执行 tasks 的命令数减少到 3 步以内
- 可产出标准化 go/no-go 结果

## 阶段 II（中期，2~4 个版本）

目标：统一状态语义与跨模块消费协议。

1. 引入统一状态字段与结果契约
2. 对 orchestrate/auto/scene 输出做兼容升级
3. 将 docs governance 串入 pipeline 末端强校验

交付判据：

- 任务状态与执行状态不一致率显著下降
- 多 Agent 路径具备稳定可追溯 run_id/trace_id

## 阶段 III（长期，4+ 版本）

目标：形成“Spec 即控制面”的产品形态。

1. 打通场景路由与 spec 阶段自动决策
2. 将 scene 执行反馈闭环写回 spec 任务建议
3. 建立组织级策略中心（policy as code）

交付判据：

- 主流程可策略化配置
- 跨团队协作具备统一审计与复现能力

## 3. 与后续 Spec 的映射

- `109`：起步效率（bootstrap）
- `110`：流程编排（pipeline）
- `111`：质量收敛（gate standardization）

## 4. 风险与缓解

1. **风险：** 新能力继续横向扩展，主线再被稀释
   - **缓解：** 设立主线准入规则：新增能力必须声明其 Spec 主线映射点

2. **风险：** 状态契约改造影响存量命令
   - **缓解：** 双协议兼容 + 渐进迁移

3. **风险：** 多 Agent 并行下规则执行成本上升
   - **缓解：** 分层 gate（快速门 + 完整门）

