# 需求文档：Scene Ontology Enhancement

## 简介

借鉴 Palantir Foundry 架构（Ontology、AIP、Data Lineage），为 SCE Scene Runtime 引入四项核心增强：Ontology 语义关联图、Action Abstraction（Intent/Precondition/Postcondition）、Data Lineage 数据血缘追踪、Agent-Ready Metadata。这些增强使 binding refs 之间的关系可查询可推理，使 AI Agent 能理解操作语义，使数据流转路径可追踪审计，使场景包具备 AI 可读性。

## 术语表

- **OntologyGraph**: 管理 binding ref 节点和边（关系）的图数据结构
- **Binding_Ref**: 场景包中引用外部能力的字符串标识符，如 `moqui.OrderHeader.list`
- **Relation_Type**: 节点间关系类型，包括 `depends_on`、`composes`、`extends`、`produces`
- **Action_Abstraction**: 为 binding 附加的 intent（意图）、preconditions（前置条件）、postconditions（后置条件）声明
- **Data_Lineage**: 数据从 source 经 transform 到 sink 的流转路径描述
- **Agent_Hints**: 场景包中供 AI Agent 理解和执行场景的元数据字段
- **Scene_Ontology_Module**: 核心模块 `lib/scene-runtime/scene-ontology.js`
- **Lint_Engine**: 现有的场景模板检查引擎 `scene-template-linter.js`
- **Score_Calculator**: 现有的质量评分计算器

## 需求

### 需求 1：OntologyGraph 核心数据结构

**用户故事：** 作为场景开发者，我希望 binding refs 之间的语义关系被建模为图结构，以便查询和推理 refs 之间的依赖、组合、继承和产出关系。

#### 验收标准

1. THE OntologyGraph SHALL 提供 `addNode(ref, metadata)` 方法，将 binding ref 注册为图中的节点
2. THE OntologyGraph SHALL 提供 `addEdge(sourceRef, targetRef, relationType)` 方法，建立两个节点之间的有向关系
3. THE OntologyGraph SHALL 仅接受以下 Relation_Type 值：`depends_on`、`composes`、`extends`、`produces`
4. WHEN 添加边时引用了不存在的节点，THEN THE OntologyGraph SHALL 返回包含缺失节点信息的错误
5. THE OntologyGraph SHALL 提供 `getNode(ref)` 方法，返回节点及其元数据，节点不存在时返回 null
6. THE OntologyGraph SHALL 提供 `getEdges(ref)` 方法，返回指定节点的所有出边
7. THE OntologyGraph SHALL 提供 `toJSON()` 方法，将整个图序列化为 JSON 对象
8. THE OntologyGraph SHALL 提供静态 `fromJSON(json)` 方法，从 JSON 对象反序列化重建图

### 需求 2：从 Scene Manifest 自动推断 Ontology 关系

**用户故事：** 作为场景开发者，我希望系统能从 scene-package.json 的 capability_contract.bindings 自动推断 binding refs 之间的关系，以减少手动维护成本。

#### 验收标准

1. WHEN 提供有效的 scene-package.json 对象时，THE Scene_Ontology_Module SHALL 解析 capability_contract.bindings 并为每个 binding ref 创建节点
2. WHEN 一个 binding 的 ref 包含另一个 binding ref 的前缀段时（如 `moqui.OrderHeader.list` 和 `moqui.OrderHeader.update` 共享 `moqui.OrderHeader`），THE Scene_Ontology_Module SHALL 推断两者之间存在 `composes` 关系
3. WHEN 一个 binding 声明了 `depends_on` 字段引用另一个 ref 时，THE Scene_Ontology_Module SHALL 创建 `depends_on` 边
4. WHEN bindings 数组为空或不存在时，THE Scene_Ontology_Module SHALL 返回一个空的 OntologyGraph

### 需求 3：Ontology 图一致性验证

**用户故事：** 作为场景开发者，我希望验证 ontology 图的一致性，以确保没有悬空引用或循环依赖。

#### 验收标准

1. WHEN 执行 ontology validate 时，THE Scene_Ontology_Module SHALL 检测所有边中引用的目标节点是否存在于图中
2. WHEN 检测到悬空引用时，THE Scene_Ontology_Module SHALL 返回包含所有悬空引用详情的错误列表
3. WHEN 执行 ontology validate 时，THE Scene_Ontology_Module SHALL 检测 `depends_on` 关系中的循环依赖
4. WHEN 检测到循环依赖时，THE Scene_Ontology_Module SHALL 返回包含循环路径的错误信息
5. WHEN 图通过所有一致性检查时，THE Scene_Ontology_Module SHALL 返回 `{ valid: true, errors: [] }`

### 需求 4：Ontology 依赖链查询

**用户故事：** 作为场景开发者，我希望查询某个 binding ref 的完整依赖链，以便进行影响分析。

#### 验收标准

1. WHEN 提供一个有效的 ref 时，THE Scene_Ontology_Module SHALL 返回该 ref 的所有直接和传递 `depends_on` 依赖
2. WHEN 提供的 ref 不存在于图中时，THE Scene_Ontology_Module SHALL 返回包含错误信息的结果
3. WHEN 依赖链中存在循环时，THE Scene_Ontology_Module SHALL 检测循环并在结果中标记，避免无限递归

### 需求 5：Action Abstraction — Intent/Precondition/Postcondition

**用户故事：** 作为场景开发者，我希望为 binding 声明 intent、preconditions 和 postconditions，以便 AI Agent 理解每个操作的语义。

#### 验收标准

1. THE Scene_Ontology_Module SHALL 支持解析 binding 对象中的可选字段 `intent`（字符串）、`preconditions`（字符串数组）和 `postconditions`（字符串数组）
2. WHEN binding 包含 action abstraction 字段时，THE Scene_Ontology_Module SHALL 将这些字段存储在对应节点的元数据中
3. WHEN 查询某个 ref 的 action 信息时，THE Scene_Ontology_Module SHALL 返回该 ref 的 intent、preconditions 和 postconditions
4. WHEN binding 未声明 action abstraction 字段时，THE Scene_Ontology_Module SHALL 返回空的 action 信息（intent 为 null，preconditions 和 postconditions 为空数组）

### 需求 6：Action Abstraction Lint 检查

**用户故事：** 作为场景开发者，我希望 lint 引擎检查 action abstraction 字段的格式正确性，以确保声明质量。

#### 验收标准

1. WHEN binding 声明了 `intent` 字段但值为空字符串时，THEN THE Lint_Engine SHALL 产生 warning 级别的 lint 项，code 为 `EMPTY_INTENT`
2. WHEN binding 声明了 `preconditions` 字段但不是字符串数组时，THEN THE Lint_Engine SHALL 产生 error 级别的 lint 项，code 为 `INVALID_PRECONDITIONS`
3. WHEN binding 声明了 `postconditions` 字段但不是字符串数组时，THEN THE Lint_Engine SHALL 产生 error 级别的 lint 项，code 为 `INVALID_POSTCONDITIONS`

### 需求 7：Data Lineage 数据血缘

**用户故事：** 作为场景开发者，我希望在 governance_contract 中声明数据血缘，以追踪数据从源到目标的流转路径。

#### 验收标准

1. THE Scene_Ontology_Module SHALL 支持解析 governance_contract 中的可选 `data_lineage` 字段
2. WHEN `data_lineage` 包含 `sources` 数组时，THE Scene_Ontology_Module SHALL 验证每个 source 包含 `ref`（字符串）和 `fields`（字符串数组）
3. WHEN `data_lineage` 包含 `transforms` 数组时，THE Scene_Ontology_Module SHALL 验证每个 transform 包含 `operation`（字符串）
4. WHEN `data_lineage` 包含 `sinks` 数组时，THE Scene_Ontology_Module SHALL 验证每个 sink 包含 `ref`（字符串）和 `fields`（字符串数组）
5. WHEN 查询某个 ref 的 lineage 信息时，THE Scene_Ontology_Module SHALL 返回该 ref 作为 source 或 sink 参与的所有 lineage 路径

### 需求 8：Data Lineage Lint 检查

**用户故事：** 作为场景开发者，我希望 lint 引擎检查 data lineage 的一致性，以确保 source refs 存在于 bindings 中。

#### 验收标准

1. WHEN `data_lineage.sources` 中的 ref 不存在于 capability_contract.bindings 中时，THEN THE Lint_Engine SHALL 产生 warning 级别的 lint 项，code 为 `LINEAGE_SOURCE_NOT_IN_BINDINGS`
2. WHEN `data_lineage.sinks` 中的 ref 不存在于 capability_contract.bindings 中时，THEN THE Lint_Engine SHALL 产生 warning 级别的 lint 项，code 为 `LINEAGE_SINK_NOT_IN_BINDINGS`

### 需求 9：Agent-Ready Metadata

**用户故事：** 作为场景开发者，我希望为 scene-package.json 添加 `agent_hints` 元数据，以便 AI Agent 理解和执行场景。

#### 验收标准

1. THE Scene_Ontology_Module SHALL 支持解析 scene-package.json 中的可选顶级字段 `agent_hints`
2. WHEN `agent_hints` 存在时，THE Scene_Ontology_Module SHALL 验证 `summary`（字符串）、`complexity`（枚举：`low`、`medium`、`high`）、`estimated_duration_ms`（正整数）、`required_permissions`（字符串数组）、`suggested_sequence`（字符串数组）、`rollback_strategy`（字符串）字段
3. WHEN 查询 agent info 时，THE Scene_Ontology_Module SHALL 返回解析后的 agent_hints 对象
4. WHEN `agent_hints` 不存在时，THE Scene_Ontology_Module SHALL 返回 null

### 需求 10：Agent Hints Lint 检查

**用户故事：** 作为场景开发者，我希望 lint 引擎检查 agent_hints 字段的有效性，以确保 AI 可读性质量。

#### 验收标准

1. WHEN `agent_hints` 存在但 `summary` 为空字符串时，THEN THE Lint_Engine SHALL 产生 warning 级别的 lint 项，code 为 `EMPTY_AGENT_SUMMARY`
2. WHEN `agent_hints.complexity` 不是 `low`、`medium`、`high` 之一时，THEN THE Lint_Engine SHALL 产生 error 级别的 lint 项，code 为 `INVALID_AGENT_COMPLEXITY`
3. WHEN `agent_hints.estimated_duration_ms` 存在但不是正整数时，THEN THE Lint_Engine SHALL 产生 error 级别的 lint 项，code 为 `INVALID_AGENT_DURATION`

### 需求 11：Agent Readiness 评分维度

**用户故事：** 作为场景开发者，我希望质量评分计算器增加 agent_readiness 维度，以激励场景包提供 AI 可读元数据。

#### 验收标准

1. THE Score_Calculator SHALL 增加 `agent_readiness` 评分维度，最大分值为 10 分（作为可选加分项）
2. WHEN `agent_hints.summary` 非空时，THE Score_Calculator SHALL 为 agent_readiness 加 4 分
3. WHEN `agent_hints.complexity` 为有效值时，THE Score_Calculator SHALL 为 agent_readiness 加 3 分
4. WHEN `agent_hints.suggested_sequence` 非空数组时，THE Score_Calculator SHALL 为 agent_readiness 加 3 分
5. WHEN `agent_hints` 不存在时，THE Score_Calculator SHALL 为 agent_readiness 维度给 0 分

### 需求 12：CLI 命令集成

**用户故事：** 作为场景开发者，我希望通过 CLI 命令查看和操作 ontology 相关功能，以便在开发流程中使用。

#### 验收标准

1. WHEN 执行 `sce scene ontology show` 并提供场景包路径时，THE CLI SHALL 显示该包的 ontology 图（文本格式或 JSON 格式）
2. WHEN 执行 `sce scene ontology deps --ref <ref>` 时，THE CLI SHALL 显示指定 ref 的依赖链
3. WHEN 执行 `sce scene ontology validate` 并提供场景包路径时，THE CLI SHALL 执行 ontology 一致性验证并显示结果
4. WHEN 执行 `sce scene ontology actions --ref <ref>` 时，THE CLI SHALL 显示指定 ref 的 action abstraction 信息
5. WHEN 执行 `sce scene ontology lineage --ref <ref>` 时，THE CLI SHALL 显示指定 ref 的数据血缘链
6. WHEN 执行 `sce scene ontology agent-info` 并提供场景包路径时，THE CLI SHALL 显示场景包的 agent hints 信息
7. WHEN 任何 ontology 子命令使用 `--json` 选项时，THE CLI SHALL 以 JSON 格式输出结果
8. WHEN 任何 ontology 子命令的输入无效时，THE CLI SHALL 显示清晰的错误信息并以非零退出码退出

### 需求 13：OntologyGraph 序列化往返一致性

**用户故事：** 作为场景开发者，我希望 OntologyGraph 的序列化和反序列化保持一致，以确保图数据可靠持久化。

#### 验收标准

1. FOR ALL 有效的 OntologyGraph 实例，执行 `OntologyGraph.fromJSON(graph.toJSON())` SHALL 产生与原始图等价的图（节点集合、边集合、元数据均相同）
