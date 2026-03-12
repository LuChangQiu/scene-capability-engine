# Golden Path 诊断报告

## 1. 目标主流程

推荐目标流程：

`adopt -> bootstrap -> requirements/design/tasks -> execute -> gate -> archive`

## 2. 当前实现路径（As-Is）

### 阶段 A：项目接管

- 可用：`sce adopt`
- 现状：可初始化 `.sce` 基础结构
- 诊断：**已具备**

### 阶段 B：Spec 起步

- 可用：`sce spec <name>`（create-spec alias）
- 现状：仅创建目录，后续文档仍需手工生成或手工调用增强
- 诊断：**核心断点 #1（P0）**

### 阶段 C：需求-设计-任务构建

- 可用：`enhance`、模板机制、人工编辑
- 现状：无统一 pipeline，依赖操作者经验
- 诊断：**核心断点 #2（P0）**

### 阶段 D：执行与协同

- 可用：`scene`、`orchestrate run/status/stop`、`auto`、`collab`、`lock`
- 现状：执行能力丰富，但路径多、状态源多
- 诊断：**核心断点 #3（P1）**

### 阶段 E：质量闸口

- 现状：`107-00-spec-gate-command` 已建 spec，但 CLI 尚无 `sce spec gate` 实装
- 诊断：**核心断点 #4（P0）**

### 阶段 F：归档治理

- 可用：`sce docs validate/archive`
- 现状：治理可执行，但与执行链未形成“强制闭环”
- 诊断：**核心断点 #5（P1）**

## 3. 优先级问题清单

### P0（立即影响交付效率与质量）

1. 缺少 bootstrap 向导，接管后起步重手工
2. 缺少 spec pipeline，一线使用者需拼命令
3. 缺少可用 gate 命令，无法标准化 go/no-go

### P1（影响多 Agent 收敛与可追溯）

1. 多状态文件并存，语义未统一
2. orchestrate 缺少 plan/watch/run-id 级别可观测能力
3. scene 执行结果与 tasks 真值映射约束不足

### P2（影响长期治理体验）

1. docs warning 清理未产品化串入主流程
2. 子系统参数命名存在历史包袱（如 validate 命令入口与提示不一致）

## 4. 结论

当前 SCE 已具备“强执行能力”，但在 Spec 主线上的“起步-编排-收敛”仍不够产品化。

建议优先落地：

- `109-00-spec-bootstrap-wizard`
- `110-00-spec-workflow-pipeline`
- `111-00-spec-gate-standardization`

