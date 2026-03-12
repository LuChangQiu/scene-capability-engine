# 设计文档

## 概述

本设计将 KPI 自动化分为“输入契约、采集计算、风险评估、门禁摘要、CLI 输出”五层，以最小改动接入现有 Spec 资产。

## 设计组件

### 组件 A：指标契约加载器（Metric Contract Loader）

- 读取指标定义文件（默认复用 112 的定义结构）
- 校验字段完整性、阈值区间与单位
- 输出规范化指标配置供后续流程复用

### 组件 B：快照构建器（Weekly Snapshot Builder）

- 输入：当周执行数据、历史快照、指标定义
- 输出：周度快照 JSON
- 默认落盘路径：`.sce/specs/114-00-kpi-automation-and-observability/custom/weekly-metrics/`

### 组件 C：风险评估器（Risk Evaluator）

- 规则：连续两周恶化升 `high`
- 输出：`risk_level` 与 `reasons[]`
- 兼容人工备注与自动推断并存

### 组件 D：门禁摘要生成器（Gate Summary Emitter）

- 将快照转换为门禁可消费摘要
- 输出字段：`passed_metrics`、`total_metrics`、`decision`、`evidence`
- 支持 Day30/Day60 两种检查点

### 组件 E：CLI 入口（Value Metrics Command）

- 子命令建议：`sce value metrics snapshot`
- 支持 `--period`、`--input`、`--out`、`--json`
- 默认输出人读摘要，`--json` 输出机读对象

## 数据模型

### 周度快照（weekly snapshot）

```json
{
  "period": "2026-W08",
  "ttfv_minutes": 27,
  "batch_success_rate": 0.84,
  "cycle_reduction_rate": 0.32,
  "manual_takeover_rate": 0.17,
  "risk_level": "medium",
  "reasons": ["batch_success_rate decreased week-over-week"],
  "notes": "orchestrate retries stabilized"
}
```

### 门禁摘要（gate summary）

```json
{
  "checkpoint": "day-30",
  "passed_metrics": 3,
  "total_metrics": 4,
  "decision": "go",
  "evidence": [
    ".sce/specs/114-00-kpi-automation-and-observability/custom/weekly-metrics/2026-W08.json"
  ]
}
```

## 需求映射

| 需求 | 设计组件 | 说明 |
| --- | --- | --- |
| Requirement 1 | A | 统一指标契约与校验 |
| Requirement 2 | B | 周度快照自动产出 |
| Requirement 3 | C | 趋势风险升级 |
| Requirement 4 | D | 门禁摘要复用 |
| Requirement 5 | E | CLI 可观测与回放 |

## 风险与对策

- 风险：输入数据不完整导致快照失真
  - 对策：严格字段校验 + 缺失字段显式报错
- 风险：趋势判断口径偏差
  - 对策：将比较窗口与规则写入配置并落盘到输出结果
- 风险：与现有资产路径不一致
  - 对策：默认输出到 Spec `custom/`，并支持 `--out` 覆盖
