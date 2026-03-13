# 实现计划：Scene Ontology Enhancement

## 概述

将 Palantir Foundry 启发的四项增强（Ontology Graph、Action Abstraction、Data Lineage、Agent-Ready Metadata）实现到 SCE Scene Runtime 中。核心模块为 `lib/scene-runtime/scene-ontology.js`，扩展 lint 引擎和评分计算器，新增 `sce scene ontology` CLI 子命令组。

## 任务

- [x] 1. 实现 OntologyGraph 核心类
  - [x] 1.1 创建 `lib/scene-runtime/scene-ontology.js`，实现 OntologyGraph 类
    - 实现 constructor、addNode、getNode、getAllNodes
    - 实现 addEdge（含 relationType 验证和节点存在性检查）、getEdges、getAllEdges
    - 导出 VALID_RELATION_TYPES 常量
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 1.2 实现 OntologyGraph 序列化：toJSON() 和 static fromJSON(json)
    - toJSON 返回 { nodes: [...], edges: [...] } 格式
    - fromJSON 从 JSON 重建完整图实例
    - _Requirements: 1.7, 1.8, 13.1_
  - [x]* 1.3 编写 OntologyGraph 属性测试
    - **Property 1: 节点添加/获取往返一致性**
    - **Validates: Requirements 1.1, 1.5**
  - [x]* 1.4 编写 OntologyGraph 边操作属性测试
    - **Property 2: 边添加/获取往返一致性与类型验证**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.6**
  - [x]* 1.5 编写 OntologyGraph 序列化属性测试
    - **Property 3: OntologyGraph 序列化往返一致性**
    - **Validates: Requirements 1.7, 1.8, 13.1**

- [x] 2. 实现 Manifest 解析与 Ontology 构建
  - [x] 2.1 实现 buildOntologyFromManifest(contract) 函数
    - 从 capability_contract.bindings 创建节点（含 type、timeout_ms、action 字段）
    - 实现共享前缀推断 composes 关系
    - 实现显式 depends_on 字段解析
    - 处理空 bindings 返回空图
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x]* 2.2 编写 Manifest 构建属性测试
    - **Property 4: Manifest 到 Graph 构建正确性**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 3. 实现 Ontology 验证与依赖链查询
  - [x] 3.1 实现 validateOntology(graph) 函数
    - 检测悬空引用（DANGLING_EDGE_TARGET）
    - 检测 depends_on 循环依赖（CYCLE_DETECTED，DFS 算法）
    - 返回 { valid, errors } 格式
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 3.2 实现 queryDependencyChain(graph, ref) 函数
    - BFS 遍历 depends_on 边收集传递依赖
    - 循环检测与 hasCycle 标记
    - ref 不存在时返回错误
    - _Requirements: 4.1, 4.2, 4.3_
  - [x]* 3.3 编写悬空引用检测属性测试
    - **Property 5: 悬空引用检测**
    - **Validates: Requirements 3.1, 3.2, 3.5**
  - [x]* 3.4 编写循环依赖检测属性测试
    - **Property 6: 循环依赖检测**
    - **Validates: Requirements 3.3, 3.4**
  - [x]* 3.5 编写依赖链查询属性测试
    - **Property 7: 依赖链完整性**
    - **Validates: Requirements 4.1, 4.3**

- [x] 4. Checkpoint - 确保核心模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 5. 实现 Action Abstraction 与 Data Lineage
  - [x] 5.1 实现 getActionInfo(graph, ref) 函数
    - 从节点 metadata 提取 intent、preconditions、postconditions
    - 未声明时返回默认值（null, [], []）
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 5.2 实现 parseDataLineage(contract) 和 getLineageInfo(contract, ref) 函数
    - 解析 governance_contract.data_lineage（sources、transforms、sinks）
    - 查询指定 ref 作为 source 或 sink 参与的路径
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 5.3 实现 getAgentHints(contract) 函数
    - 解析 agent_hints 字段，不存在时返回 null
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x]* 5.4 编写 Action Abstraction 属性测试
    - **Property 8: Action Abstraction 存储与查询往返一致性**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 6. 扩展 Lint 引擎
  - [x] 6.1 在 scene-template-linter.js 中实现 checkActionAbstraction(contract)
    - 检查 EMPTY_INTENT、INVALID_PRECONDITIONS、INVALID_POSTCONDITIONS
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 6.2 在 scene-template-linter.js 中实现 checkDataLineage(contract)
    - 检查 LINEAGE_SOURCE_NOT_IN_BINDINGS、LINEAGE_SINK_NOT_IN_BINDINGS
    - _Requirements: 8.1, 8.2_
  - [x] 6.3 在 scene-template-linter.js 中实现 checkAgentHints(contract)
    - 检查 EMPTY_AGENT_SUMMARY、INVALID_AGENT_COMPLEXITY、INVALID_AGENT_DURATION
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 6.4 将新 lint 检查集成到 lintScenePackage() 主函数中
    - 在现有检查步骤后添加 action abstraction、data lineage、agent hints 检查
    - 更新 checks_run 计数
    - _Requirements: 6.1, 6.2, 6.3, 8.1, 8.2, 10.1, 10.2, 10.3_
  - [x]* 6.5 编写 Action Abstraction Lint 属性测试
    - **Property 9: Action Abstraction Lint 检查正确性**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  - [x]* 6.6 编写 Lineage Lint 属性测试
    - **Property 10: Lineage Ref 一致性 Lint 检查**
    - **Validates: Requirements 8.1, 8.2**
  - [x]* 6.7 编写 Agent Hints Lint 属性测试
    - **Property 11: Agent Hints Lint 检查正确性**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 7. 扩展评分计算器
  - [x] 7.1 在 scene-template-linter.js 中实现 scoreAgentReadiness(lintResult)
    - summary 非空 +4、complexity 有效 +3、suggested_sequence 非空数组 +3
    - 最大 10 分，agent_hints 不存在时 0 分
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 7.2 将 agent_readiness 维度集成到 calculateQualityScore()
    - 作为可选加分项添加到总分计算中
    - _Requirements: 11.1_
  - [x]* 7.3 编写 Agent Readiness 评分属性测试
    - **Property 12: Agent Readiness 评分正确性**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

- [x] 8. Checkpoint - 确保 Lint 和评分测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 9. 实现 CLI 命令
  - [x] 9.1 在 lib/commands/scene.js 中注册 ontology 子命令组
    - 注册 show、deps、validate、actions、lineage、agent-info 六个子命令
    - 每个子命令支持 -p/--package 和 --json 选项
    - deps、actions、lineage 子命令需要 --ref 必选参数
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [x] 9.2 实现各子命令的 normalize/validate/run/print 函数
    - normalizeOntologyOptions、validateOntologyOptions
    - runSceneOntologyShowCommand、runSceneOntologyDepsCommand
    - runSceneOntologyValidateCommand、runSceneOntologyActionsCommand
    - runSceneOntologyLineageCommand、runSceneOntologyAgentInfoCommand
    - 对应的 print 函数（文本和 JSON 双模式）
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_
  - [x]* 9.3 编写 CLI 命令单元测试
    - 测试各子命令的 normalize、validate、run 函数
    - 测试 --json 输出格式
    - 测试无效输入的错误处理
    - _Requirements: 12.1-12.8_

- [x] 10. 导出与集成
  - [x] 10.1 更新 scene-ontology.js 的 module.exports
    - 导出所有公共函数和类：OntologyGraph、VALID_RELATION_TYPES、buildOntologyFromManifest、validateOntology、queryDependencyChain、getActionInfo、parseDataLineage、getLineageInfo、getAgentHints
    - _Requirements: 全部_
  - [x] 10.2 更新 scene-template-linter.js 的 module.exports
    - 导出新增函数：checkActionAbstraction、checkDataLineage、checkAgentHints、scoreAgentReadiness
    - _Requirements: 6.1-6.3, 8.1-8.2, 10.1-10.3, 11.1-11.5_

- [x] 11. 最终 Checkpoint - 全量测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选，可跳过以加速 MVP
- 每个任务引用具体需求以确保可追溯性
- Checkpoint 确保增量验证
- 属性测试验证普遍正确性，单元测试验证具体示例和边界情况
- 所有新代码在 `lib/scene-runtime/scene-ontology.js` 和 `lib/scene-runtime/scene-template-linter.js` 中
- CLI 集成在 `lib/commands/scene.js` 中
- 测试在 `tests/unit/scene-runtime/scene-ontology.test.js` 和 `tests/unit/commands/scene.test.js` 中
- 本轮补充的属性测试与 CLI 证据记录在 `custom/property-and-cli-closeout-2026-03-12.md`
