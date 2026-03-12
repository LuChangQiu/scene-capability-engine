# 实现任务

## 任务 1：组合收敛策略沉淀

- [x] 1.1 产出多 Spec 组合推进策略
  - 输出 `custom/portfolio-convergence-policy.md`
  - **验证**: Requirement 1.1, 1.2, 1.3

## 任务 2：Archive 分流根因修复

- [x] 2.1 修复 `archive-tool` 子目录解析与 `specSubdirs` 对齐
  - 修改 `lib/governance/archive-tool.js`
  - **验证**: Requirement 2.1, 2.2, 2.3

- [x] 2.2 补充分流回落单元测试
  - 修改 `tests/unit/governance/archive-tool.test.js`
  - **验证**: Requirement 2.2, 2.3, 4.1

## 任务 3：历史告警收敛修复

- [x] 3.1 修复 75/76/77/78/79/80/81/83/84/85/86/87/88/89/90/91/92/93/94/95/96 号 Spec 的归档目录不合规问题
  - 将 `docs/.config.sce` 迁移为 `custom/.config.sce`
  - **验证**: Requirement 3.1, 3.2

## 任务 4：稳定性回归与清单化

- [x] 4.1 运行治理状态回归检查
  - 命令：`sce docs diagnose`、`sce status --verbose`
  - **验证**: Requirement 3.3, 4.3

- [x] 4.2 产出稳定性复跑清单
  - 输出 `custom/stability-smoke-checklist.md`
  - **验证**: Requirement 4.2
