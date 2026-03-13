# Implementation Plan: Scene Template Contribute Pipeline

## Overview

基于设计文档，将 Lint 引擎、质量评分计算器和三个 CLI 命令（`scene lint`、`scene score`、`scene contribute`）分步实现。先实现核心模块，再集成 CLI，最后连接流水线。

## Tasks

- [x] 1. 创建 Lint 引擎核心模块
  - [x] 1.1 创建 `lib/scene-runtime/scene-template-linter.js`，实现 `createLintItem`、`checkManifestCompleteness`、`checkSceneManifestCompleteness` 函数
    - `createLintItem(level, code, message)` 返回 `{ level, code, message }`
    - `checkManifestCompleteness(contract)` 检查 scene-package.json 必需字段（apiVersion, kind, metadata, capabilities, artifacts, governance）
    - `checkSceneManifestCompleteness(manifest)` 检查 scene.yaml 必需字段（apiVersion, kind, metadata, spec）
    - 导出常量: `KNOWN_BINDING_REF_PREFIXES`, `VALID_RISK_LEVELS`, `KEBAB_CASE_PATTERN`, `SEMVER_PATTERN`, `REQUIRED_PACKAGE_FIELDS`, `REQUIRED_MANIFEST_FIELDS`, `SCORE_WEIGHTS`
    - _Requirements: 1.2, 1.8_

  - [x] 1.2 实现 `checkBindingRefFormat`、`checkGovernanceReasonableness`、`checkPackageConsistency` 函数
    - `checkBindingRefFormat(contract)` 从 capability_contract.bindings 或 spec.capability_contract.bindings 提取 ref，验证前缀匹配
    - `checkGovernanceReasonableness(governance)` 检查 risk_level、approval.required、idempotency.required
    - `checkPackageConsistency(contract, packageDir, fileSystem)` 检查 name kebab-case、version semver、entry_scene 文件存在
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 1.3 实现 `checkTemplateVariables`、`checkDocumentation`、`lintScenePackage` 函数
    - `checkTemplateVariables(contract)` 检查 variables/parameters 数组中每个变量的 type 和 description
    - `checkDocumentation(contract, packageDir, fileSystem)` 检查 README.md 存在或 metadata.description 非空
    - `lintScenePackage(packageDir, options)` 编排所有检查，读取 scene-package.json 和 scene.yaml，返回 LintResult
    - 处理 MANIFEST_READ_FAILED 和 SCENE_YAML_READ_FAILED 边界情况
    - _Requirements: 1.1, 1.6, 1.7, 1.9, 1.10_

  - [x]* 1.4 为 Lint 引擎编写 property tests
    - **Property 1: Lint 结果结构不变量**
    - **Validates: Requirements 1.1, 1.8**
    - **Property 2: 缺失必需字段产生错误**
    - **Validates: Requirements 1.2**
    - **Property 3: Binding ref 格式验证**
    - **Validates: Requirements 1.3**
    - **Property 4: Governance 合理性检查**
    - **Validates: Requirements 1.4**
    - **Property 5: Package 一致性检查**
    - **Validates: Requirements 1.5**
    - **Property 6: 模板变量验证**
    - **Validates: Requirements 1.6**
    - **Property 7: 文档存在性检查**
    - **Validates: Requirements 1.7**

  - [x]* 1.5 为 Lint 引擎编写 unit tests
    - 测试 `lintScenePackage` 完整有效包、缺失 scene-package.json、缺失 scene.yaml、空目录
    - 测试各 check 函数的具体示例和边界情况
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10_

- [x] 2. 实现质量评分计算器
  - [x] 2.1 在 `scene-template-linter.js` 中实现 `scoreContractValidity`、`scoreLintPassRate`、`scoreDocumentationQuality`、`scoreGovernanceCompleteness`、`calculateQualityScore` 函数
    - `scoreContractValidity(lintResult)` 基于 _context.contractErrors 和 _context.manifestErrors 计算 0-30 分
    - `scoreLintPassRate(lintResult)` 基于 error/warning 数量计算 0-30 分: `max(0, 30 - 10*errors - 3*warnings)`
    - `scoreDocumentationQuality(lintResult)` 基于 _context.hasReadme、description、变量描述计算 0-20 分
    - `scoreGovernanceCompleteness(lintResult)` 基于 governance 字段完整性计算 0-20 分
    - `calculateQualityScore(lintResult, options)` 汇总四个维度，返回 ScoreResult
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x]* 2.2 为评分计算器编写 property tests
    - **Property 8: 评分总分不变量**
    - **Validates: Requirements 2.1, 2.6**
    - **Property 9: 评分维度公式正确性**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**
    - **Property 15: 评分阈值决定通过/失败**
    - **Validates: Requirements 5.3, 5.6**

  - [x]* 2.3 为评分计算器编写 unit tests
    - 测试满分包（100分）、空包（0分）、中等质量包
    - 测试各维度边界值（0分、满分）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Checkpoint - 确保核心模块测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现 `scene lint` CLI 命令
  - [x] 4.1 在 `lib/commands/scene.js` 中实现 `normalizeSceneLintOptions`、`validateSceneLintOptions`、`runSceneLintCommand`、`printSceneLintSummary` 函数
    - normalize: package 默认 '.'，json 默认 false，strict 默认 false
    - run: 解析 packageDir → 调用 lintScenePackage → strict 模式处理 → 构建 payload → print
    - print: json 模式输出 JSON，否则输出人类可读摘要（error/warning/info 计数 + 详情）
    - 在 `registerSceneCommands` 中注册 `scene lint` 子命令
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 4.2 为 `scene lint` 命令编写 unit tests
    - 测试成功路径、失败路径、strict 模式、json 输出、默认 package 目录
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 5. 实现 `scene score` CLI 命令
  - [x] 5.1 在 `lib/commands/scene.js` 中实现 `normalizeSceneScoreOptions`、`validateSceneScoreOptions`、`runSceneScoreCommand`、`printSceneScoreSummary` 函数
    - normalize: package 默认 '.'，json 默认 false，threshold 默认 60
    - validate: threshold 必须是 0-100 之间的数字
    - run: 解析 packageDir → 调用 lintScenePackage → 调用 calculateQualityScore → 构建 payload → print
    - print: json 模式输出 JSON，否则输出总分、维度明细、pass/fail 状态
    - 在 `registerSceneCommands` 中注册 `scene score` 子命令
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x]* 5.2 为 `scene score` 命令编写 unit tests
    - 测试成功路径、低于阈值、json 输出、自定义阈值
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 6. 实现 `scene contribute` CLI 命令
  - [x] 6.1 在 `lib/commands/scene.js` 中实现 `normalizeSceneContributeOptions`、`validateSceneContributeOptions`、`runSceneContributeCommand`、`printSceneContributeSummary` 函数
    - normalize: package 默认 '.'，registry 默认 '.sce/registry'，所有布尔选项默认 false
    - run: 编排五阶段流水线（validate → lint → score → preview → publish）
    - 复用 `validateScenePackageContract` 进行合约验证
    - 复用 `lintScenePackage` 和 `calculateQualityScore` 进行质量检查
    - 复用 `validatePackageForPublish`、`bundlePackageTarball`、`storeToRegistry`、`loadRegistryIndex`、`addVersionToIndex`、`saveRegistryIndex` 进行发布
    - 支持 --dry-run、--strict、--skip-lint、--force、--json 选项
    - print: json 模式输出 JSON，否则输出各阶段摘要
    - 在 `registerSceneCommands` 中注册 `scene contribute` 子命令
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [x]* 6.2 为 `scene contribute` 命令编写 property tests
    - **Property 10: Strict 模式将警告视为错误**
    - **Validates: Requirements 3.4, 4.3**
    - **Property 11: Dry-run 阻止发布**
    - **Validates: Requirements 3.3**
    - **Property 12: Skip-lint 跳过 lint 和评分阶段**
    - **Validates: Requirements 3.5**
    - **Property 13: 流水线在验证/lint 失败时停止**
    - **Validates: Requirements 3.9, 3.10**
    - **Property 14: Normalize 保留所有 CLI 选项**
    - **Validates: Requirements 3.2, 4.1, 5.1**

  - [x]* 6.3 为 `scene contribute` 命令编写 unit tests
    - 测试完整流水线成功路径、dry-run、skip-lint、strict、validation 失败、lint 失败
    - 测试 normalize/validate 函数各选项组合
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 7. 序列化往返测试和错误处理
  - [x]* 7.1 编写 JSON 序列化往返 property test
    - **Property 16: JSON 序列化往返一致性**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x]* 7.2 编写错误处理 unit tests
    - 测试 Package_Dir 不存在、scene-package.json 缺失/无效 JSON、scene.yaml 缺失
    - 测试 registry 目录不存在时自动创建
    - 测试意外错误捕获和 exitCode 设置
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Final checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 所有新模块代码位于 `lib/scene-runtime/scene-template-linter.js`
- CLI 集成代码位于 `lib/commands/scene.js`
- 测试位于 `tests/unit/scene-runtime/scene-template-linter.test.js` 和 `tests/unit/commands/scene.test.js`
- Property tests 使用 fast-check 库，每个属性测试 100+ 次迭代
- 不引入任何新的外部依赖
