# Design

## Requirement Mapping

- R1-R3 -> canonical file source plus rebuildable projection contract
- R4 -> projection diagnostics and read-source transparency
- R5-R6 -> pilot scope control and audit portability constraints

## Projection Model

1. Raw stream remains append-only file
   - JSONL 文件继续作为证据、发布资产、人工审计输入
2. Projection builder reads files and writes SQLite tables
   - projection 表只保存查询友好的字段与必要的原始引用
3. Rebuild and doctor
   - 提供重建、校验、对账能力
4. Transparent reads
   - 查询接口说明结果来自 `file` 还是 `sqlite-projection`

## Pilot Selection Rules

只选择同时满足以下条件的流进入首批 pilot：

1. 查询频率高于人工直接查看文件
2. 常见查询需要按时间、actor、type、result 过滤
3. 投影字段模型稳定
4. 原始文件作为发布证据仍然完整保留

## Proposed Deliverables

- projection design doc for selected pilot stream
- rebuild/doctor command contract
- one or two pilot projection tables
- operator guidance covering rebuild, fallback, and audit usage
