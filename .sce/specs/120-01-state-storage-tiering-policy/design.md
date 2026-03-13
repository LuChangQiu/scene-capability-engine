# Design

## Requirement Mapping

- R1-R2 -> decision rubric and tier definitions
- R3-R5 -> current resource inventory and canonical classification
- R6 -> future admission checklist and governance hook

## Tier Model

1. `file-source`
   - 适用于低基数配置、人工可读性优先、原子单文件状态、原始证据与审计流
2. `sqlite-index`
   - 适用于文件仍为内容源，但需要高频过滤、聚合、排序、跨会话查询的注册表/索引
3. `derived-sqlite-projection`
   - 适用于 append-only 文件流的查询优化
   - SQLite 内容可删除、可重建、不可反向替代源文件

## Proposed Deliverables

- `docs/state-storage-tiering.md`
  - 解释分层原则、当前分类、反例、准入规则
- `.sce/config/state-storage-policy.json`
  - 机器可读的 tier catalog 与 admission checklist
- optional audit/gate hook
  - 对新增候选资源执行最基本的政策校验

## Decision Rubric

资源只有同时满足以下方向，才应进入 SQLite 范围：

1. 跨运行或跨会话查询频繁
2. 过滤/排序/聚合成本明显高于文件扫描
3. 存在多文件漂移或索引一致性风险
4. SQLite 内容可以从 canonical source 重建

出现以下任一情况时，默认停留在文件层：

1. 资源是原始审计或 evidence
2. Git diff / 人工排障价值高于查询价值
3. 资源规模小、变更稀疏、单文件原子写已足够
4. 资源是个人本地偏好或工作区选择状态
