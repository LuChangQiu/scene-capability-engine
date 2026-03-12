# Requirements Document

## Introduction

Scene Template Contribute Pipeline 为 SCE 用户提供一站式模板贡献工作流。该功能包含三个核心模块：模板 Lint 引擎（质量检查）、质量评分计算器（0-100 分）、以及编排命令 `scene contribute`。同时提供独立的 `scene lint` 和 `scene score` 子命令，方便用户在贡献前单独运行质量检查和评分。所有新模块代码位于 `lib/scene-runtime/scene-template-linter.js`，CLI 集成遵循 `lib/commands/scene.js` 中已有的 normalize → validate → run → print 模式。

## Glossary

- **Linter**: `scene-template-linter.js` 模块中负责模板质量检查的引擎
- **Lint_Result**: Linter 返回的结构化检查结果，包含 errors、warnings、info 三个级别的检查项
- **Lint_Item**: Lint_Result 中的单个检查项，包含 level（error/warning/info）、code、message 字段
- **Quality_Score**: 质量评分计算器返回的 0-100 分评分结果
- **Score_Result**: 评分计算器返回的结构化结果，包含总分、各维度分数和明细
- **Contribute_Pipeline**: `scene contribute` 命令编排的完整贡献流水线
- **Contribute_Result**: 贡献流水线返回的结构化结果，包含验证、lint、评分、发布各阶段的输出
- **Package_Dir**: 包含 scene-package.json 的场景包目录
- **Registry_Dir**: 本地注册表目录（默认 `.sce/registry`）

## Requirements

### Requirement 1: 模板 Lint 引擎

**User Story:** As a template author, I want to run quality checks on my scene template, so that I can identify and fix issues before contributing.

#### Acceptance Criteria

1. WHEN a valid Package_Dir is provided, THE Linter SHALL read scene-package.json and scene.yaml, then execute all lint checks and return a Lint_Result
2. THE Linter SHALL check manifest completeness: scene-package.json must contain apiVersion, kind, metadata, capabilities, artifacts, and governance fields; scene.yaml must contain apiVersion, kind, metadata, and spec fields
3. WHEN a binding ref is found in capability_contract.bindings, THE Linter SHALL validate that the ref matches a known pattern (prefix matches one of: moqui.*, spec.erp.*, sce.scene.*)
4. THE Linter SHALL check governance contract reasonableness: risk_level must be one of (low, medium, high), approval.required must be boolean, idempotency.required must be boolean
5. THE Linter SHALL check package contract consistency: metadata.name must match kebab-case pattern, metadata.version must be valid semver, artifacts.entry_scene file must exist in Package_Dir
6. WHEN template variables are defined in scene-package.json, THE Linter SHALL validate that each variable has a non-empty type and description field
7. THE Linter SHALL check documentation presence: Package_Dir must contain a README.md file or scene-package.json metadata must contain a non-empty description field
8. THE Linter SHALL return a Lint_Result containing separate arrays for errors, warnings, and info items, where each Lint_Item includes level, code, and message fields
9. IF scene-package.json cannot be read or parsed, THEN THE Linter SHALL return a Lint_Result with a single error item and code "MANIFEST_READ_FAILED"
10. IF scene.yaml cannot be read or parsed, THEN THE Linter SHALL include a warning item with code "SCENE_YAML_READ_FAILED" and continue checking remaining rules

### Requirement 2: 质量评分计算器

**User Story:** As a template author, I want to see a quality score for my template, so that I can understand how well it meets contribution standards.

#### Acceptance Criteria

1. THE Score_Calculator SHALL compute a Quality_Score on a 0-100 scale based on four dimensions: contract validity (30 points), lint pass rate (30 points), documentation quality (20 points), governance completeness (20 points)
2. WHEN computing contract validity score, THE Score_Calculator SHALL award 15 points for a valid scene-package.json (zero contract validation errors) and 15 points for a valid scene.yaml (zero manifest validation errors)
3. WHEN computing lint pass rate score, THE Score_Calculator SHALL award 30 points for zero lint errors and zero lint warnings, deduct 10 points per error (minimum 0), and deduct 3 points per warning (minimum 0)
4. WHEN computing documentation quality score, THE Score_Calculator SHALL award 10 points for README.md presence, 5 points for non-empty metadata.description, and 5 points for all template variables having descriptions
5. WHEN computing governance completeness score, THE Score_Calculator SHALL award points for: risk_level set (5 points), approval fields set (5 points), idempotency fields set (5 points), rollback_supported set (5 points)
6. THE Score_Calculator SHALL return a Score_Result containing total score, dimension breakdown, and a pass/fail status based on a configurable threshold (default 60)
7. THE Score_Calculator SHALL accept a Lint_Result as input to avoid redundant re-computation of lint checks

### Requirement 3: `scene contribute` 编排命令

**User Story:** As a template author, I want a single command that validates, lints, scores, and publishes my template, so that the contribution process is streamlined.

#### Acceptance Criteria

1. WHEN the `scene contribute` command is executed, THE Contribute_Pipeline SHALL execute stages in order: (a) validate scene-package.json contract, (b) run lint checks, (c) calculate quality score, (d) show preview summary, (e) publish to registry
2. THE CLI SHALL accept the following options: `--package <dir>`, `--registry <dir>`, `--dry-run`, `--strict`, `--json`, `--skip-lint`, `--force`
3. WHEN the `--dry-run` option is provided, THE Contribute_Pipeline SHALL execute all stages except publishing and return a Contribute_Result with `published: false`
4. WHEN the `--strict` option is provided, THE Contribute_Pipeline SHALL treat lint warnings as errors and fail the pipeline if any warnings exist
5. WHEN the `--skip-lint` option is provided, THE Contribute_Pipeline SHALL skip lint checks and quality score calculation, proceeding directly from contract validation to publishing
6. WHEN the `--force` option is provided, THE Contribute_Pipeline SHALL pass the force flag to the publish stage to allow overwriting existing versions
7. WHEN the `--json` option is provided, THE CLI SHALL output the Contribute_Result as formatted JSON to stdout
8. WHEN the `--json` option is not provided, THE CLI SHALL print a human-readable summary showing validation status, lint results, quality score, and publish outcome
9. IF contract validation fails, THEN THE Contribute_Pipeline SHALL stop execution and return a Contribute_Result with `success: false` and the validation errors
10. IF lint checks produce errors (or warnings in strict mode), THEN THE Contribute_Pipeline SHALL stop execution and return a Contribute_Result with `success: false` and the lint errors
11. THE Contribute_Pipeline SHALL reuse existing `validateScenePackageContract` for contract validation and existing publish logic from `runScenePackageRegistryPublishCommand` for the publish stage
12. THE CLI SHALL follow the normalize → validate → run → print pattern established in `lib/commands/scene.js`

### Requirement 4: `scene lint` 独立命令

**User Story:** As a template author, I want to run lint checks independently, so that I can fix issues before running the full contribute pipeline.

#### Acceptance Criteria

1. THE CLI SHALL register a `scene lint` subcommand that accepts `--package <dir>`, `--json`, and `--strict` options
2. WHEN the `scene lint` command is executed, THE CLI SHALL run the Linter on the specified Package_Dir and display the Lint_Result
3. WHEN the `--strict` option is provided, THE CLI SHALL treat warnings as errors and set process.exitCode to 1 if any warnings exist
4. WHEN the `--json` option is provided, THE CLI SHALL output the Lint_Result as formatted JSON to stdout
5. WHEN the `--json` option is not provided, THE CLI SHALL print a human-readable summary showing error count, warning count, info count, and individual item details
6. IF the `--package` option is not provided, THE CLI SHALL default to the current working directory
7. THE CLI SHALL follow the normalize → validate → run → print pattern and set process.exitCode to 1 when lint errors are found

### Requirement 5: `scene score` 独立命令

**User Story:** As a template author, I want to see my template's quality score independently, so that I can track improvement before contributing.

#### Acceptance Criteria

1. THE CLI SHALL register a `scene score` subcommand that accepts `--package <dir>`, `--json`, and `--threshold <number>` options
2. WHEN the `scene score` command is executed, THE CLI SHALL run the Linter and Score_Calculator on the specified Package_Dir and display the Score_Result
3. WHEN the `--threshold` option is provided, THE CLI SHALL use the specified value as the minimum passing score; default threshold is 60
4. WHEN the `--json` option is provided, THE CLI SHALL output the Score_Result as formatted JSON to stdout
5. WHEN the `--json` option is not provided, THE CLI SHALL print a human-readable summary showing total score, dimension breakdown, and pass/fail status
6. IF the quality score is below the threshold, THEN THE CLI SHALL set process.exitCode to 1
7. IF the `--package` option is not provided, THE CLI SHALL default to the current working directory
8. THE CLI SHALL follow the normalize → validate → run → print pattern

### Requirement 6: 结构化输出与序列化

**User Story:** As a developer, I want all command outputs to be serializable and deserializable without data loss, so that the results can be reliably consumed by automation tools.

#### Acceptance Criteria

1. FOR ALL valid Lint_Results, serializing to JSON and deserializing SHALL produce an equivalent object
2. FOR ALL valid Score_Results, serializing to JSON and deserializing SHALL produce an equivalent object
3. FOR ALL valid Contribute_Results, serializing to JSON and deserializing SHALL produce an equivalent object

### Requirement 7: 错误处理与容错

**User Story:** As a template author, I want clear error messages when something goes wrong, so that I can quickly identify and fix issues.

#### Acceptance Criteria

1. IF the Package_Dir does not exist, THEN THE CLI SHALL print a descriptive error message and set process.exitCode to 1
2. IF scene-package.json is missing or contains invalid JSON, THEN THE Linter SHALL return a Lint_Result with error code "MANIFEST_READ_FAILED" and a descriptive message
3. IF scene.yaml is missing, THEN THE Linter SHALL include a warning and continue checking remaining rules based on scene-package.json alone
4. WHEN the `--registry` directory does not exist during publish, THE Contribute_Pipeline SHALL create the directory recursively before publishing
5. IF an unexpected error occurs during any pipeline stage, THEN THE CLI SHALL catch the error, print a descriptive message, and set process.exitCode to 1
