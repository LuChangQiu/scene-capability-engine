# 需求文档

## 简介

本 Spec 是 Moqui 补齐项目的最终验收闸口，负责输出 parity 矩阵、风险清单和发布建议，确保“功能可用 + 文档一致 + 测试稳定”。

## 术语表

- **Parity_Matrix**: `331-poc` 能力到 sce 能力的映射矩阵
- **Acceptance_Gate**: 发布前统一验收检查
- **Release_Recommendation**: 发布建议（go / conditional-go / no-go）

## 需求

### 需求 1：能力矩阵

**用户故事：** 作为负责人，我希望看到可审计的对齐矩阵，明确已完成与剩余差异。

#### 验收标准

1. THE Parity_Matrix SHALL 覆盖 auth/entity/service/screen/api-catalog/monitoring 六大类
2. THE 每个能力项 SHALL 标记状态：done / partial / todo
3. THE 矩阵 SHALL 标注对应代码文件与测试文件引用

### 需求 2：验收闸口

**用户故事：** 作为发布者，我希望发布决策有统一标准。

#### 验收标准

1. THE Acceptance_Gate SHALL 校验 `98-00` 到 `102-00` mandatory 任务完成情况
2. THE Acceptance_Gate SHALL 校验 Moqui 相关测试集通过情况
3. THE Acceptance_Gate SHALL 输出 residual risks 与缓解建议

### 需求 3：发布建议输出

**用户故事：** 作为项目干系人，我希望获得清晰发布结论。

#### 验收标准

1. THE Spec SHALL 输出 `Release_Recommendation`（go / conditional-go / no-go）
2. WHEN 结论为 conditional-go THEN 必须附带明确限制条件
3. WHEN 结论为 no-go THEN 必须附带阻塞项与下一步计划

### 需求 4：SCE 发布收口

**用户故事：** 作为发布者，我希望在 parity gate 通过后有标准化发布收口动作。

#### 验收标准

1. WHEN `Release_Recommendation` 为 go 或 conditional-go THEN SHALL 生成版本发布检查单
2. THE 检查单 SHALL 包含版本号策略、changelog 更新、README/command-reference 同步、回滚说明
3. THE 收口输出 SHALL 明确是否允许执行 GitHub 发布动作
