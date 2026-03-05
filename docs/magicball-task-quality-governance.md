# Magicball 任务质量治理对接说明（SCE）

> 适用于：Magicball AI 助手任务卡 UI 的质量治理增强与 SCE Task 质量闭环对接。

## 1. 背景与目标

任务由对话生成，容易出现「多事项混杂、目标不清晰、验收缺失」等问题，导致执行偏移或兜底编程。
SCE 新增「任务质量治理」闭环能力，保证每个任务可执行、可验收、可追踪。

目标：
- 让 Magicball UI 在**同一任务卡**内完成“草案 -> 评分 -> 修正 -> Promote”的闭环
- 通过质量门禁（Policy）强制任务可执行、可验收
- 保留用户原始输入，避免信息丢失

## 2. SCE 新增能力概览

新增 CLI：
- `sce task draft`
- `sce task consolidate`
- `sce task score`
- `sce task promote`

新增策略文件：
- `.sce/config/task-quality-policy.json`
- 支持 `--policy <path>` 覆盖

默认门禁（可配置）：
- acceptance_criteria 必须存在
- needs_split 必须为 false
- min_score >= 70

## 3. 推荐交互流程（最短闭环）

1. 用户输入 -> `sce task draft`
2. 多轮输入合并 -> `sce task consolidate`
3. 评分 -> `sce task score`
4. 通过门禁 -> `sce task promote`
5. 成功写入 `tasks.md`

## 4. 字段契约（建议 Magicball 消费）

核心字段：
- `task_ref`（草案阶段可为空）
- `title_norm`
- `raw_request`
- `goal`
- `sub_goals`
- `acceptance_criteria`
- `needs_split`
- `confidence`
- `next_action`
- `handoff`
- `score`

示例（草案阶段）：
```json
{
  "task_ref": null,
  "title_norm": "生成客户-订单-库存演示数据流程",
  "raw_request": "帮我做一个客户订单库存的demo",
  "goal": "生成可运行的客户-订单-库存演示流程",
  "sub_goals": ["定义实体关系", "生成测试数据", "配置页面展示"],
  "acceptance_criteria": [],
  "needs_split": true,
  "confidence": 0.68,
  "next_action": "split",
  "handoff": "needs_split=true, acceptance_criteria empty"
}
```

评分示例：
```json
{
  "score": 62,
  "missing_items": ["acceptance_criteria", "split_required"]
}
```

Promote 成功：
```json
{
  "success": true,
  "task_ref": "01.02.03",
  "message": "promoted"
}
```

Promote 失败：
```json
{
  "success": false,
  "message": "quality gate failed",
  "reasons": ["acceptance_criteria missing", "needs_split=true"]
}
```

## 5. UI 行为规范（强制）

- 草案页：默认显示**评分卡 + 缺失项**
- `needs_split=true`：必须拆分或补充，**禁止 promote**
- `acceptance_criteria` 为空：**阻断 promote**
- promote 失败时提示固定文案：**“质量门禁未通过”**

## 6. 基于现有任务 UI 的最小改动建议

当前 UI：单卡片 + 事件流 + 文件变更 + 错误信息。
在不改整体布局的前提下，建议：

1) 任务头部
- 显示 `title_norm`
- `raw_request` 置于标题下方（可折叠）
- 状态徽标：Draft / Needs Split / Missing Acceptance / Ready / Failed Gate

2) 评分卡（插入到事件流上方）
- 展示 `score / missing_items / next_action`
- 点击展开查看策略阈值与建议

3) 强制阻断逻辑
- needs_split 或 acceptance 缺失 => promote 按钮置灰
- 展示原因与修复入口

4) Promote 失败提示
- 固定文案 “质量门禁未通过”
- 展示失败原因列表

5) 原有事件流保留，增强复制能力
- 错误日志一键复制，便于诊断

## 7. 参考命令（Magicball 封装为 API 即可）

```bash
sce task draft --spec <specPath> --input "<user text>"
sce task consolidate --spec <specPath>
sce task score --spec <specPath>
sce task promote --spec <specPath>
```

## 8. 版本与发布说明

该能力自 **SCE v3.6.11** 开始提供，若 Magicball 需要兼容老版本，请做版本检测与能力降级处理。

---

如需进一步输出 UI 页面原型或字段映射表，可直接在此文档上增补。
