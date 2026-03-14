# SCE - Scene Capability Engine

[![npm version](https://badge.fury.io/js/scene-capability-engine.svg)](https://badge.fury.io/js/scene-capability-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**SCE 是面向 AI 原生软件交付的场景治理与执行引擎。**
它把开放式的 Agent 工作，收敛为一条可治理的路径：`goal -> scene -> spec -> task -> patch -> verify -> release`。

[English](README.md) | 简体中文

---

## SCE 解决什么问题

AI Agent 可以很快生成代码，但也很容易出现这些问题：

- 上下文漂移，越聊越散
- 需求、设计、任务混在会话里，难以治理
- 过程资产只存在本地会话中，没推 Git 就容易丢
- 自动执行虽然快，但缺少稳定门禁和发布证据

SCE 提供的就是这一层控制能力：

- `Scene 主导上下文`：一个 scene 对应一个主会话，多个 spec 挂在 scene 下持续推进
- `Spec 先行治理`：需求、设计、任务、门禁都绑定到 spec，而不是散落在聊天记录里
- `自动闭环可控`：`close-loop`、`close-loop-program`、`close-loop-controller` 都能在边界内自动收敛
- `本地历史可恢复`：timeline、task ref、SQLite 状态让过程资产可回看、可恢复、可重跑
- `发布级治理`：handoff 证据、git 管理门禁、errorbook 学习闭环，让“看起来完成”变成“可验证完成”

---

## 核心对象模型

SCE 用一条稳定层级来管理 Agent 工作：

- `session -> scene -> spec -> task -> event`
- `scene` 是业务连续性的主边界
- `spec` 是被治理的工作包
- `task` 是面向人的最小执行单元
- `event` 保留原始审计流，作为 task 背后的底层记录

这让长周期 Agent 执行不再依赖脆弱的聊天上下文，而是依赖可治理的结构化对象。

---

## 主要能力

### 1. Scene + Spec 治理
- `studio plan` 自动做目标 intake，并绑定或创建 spec
- scene 维度的 spec 组合治理与历史 spec 回填
- 场景/规格/任务契约统一落在 `.sce/` 下
- 支持按 scene 组织长期连续交付

### 2. Studio 执行流
- `studio plan -> generate -> apply -> verify -> release`
- 面向 IDE / 前端的结构化 task 流
- 任务引用 `SS.PP.TT`，支持查询和重跑
- 写操作支持 auth lease 保护

### 3. 自动闭环交付
- `sce auto close-loop`
- `sce auto close-loop-batch`
- `sce auto close-loop-program`
- `sce auto close-loop-controller`
- 内建 retry、fallback-chain、governance replay、异常感知调度

### 4. 问题闭环与 Errorbook
- problem-domain map / chain / contract / closure gate
- incident staging，先保留试错过程，再沉淀高价值错题
- 本地错题本 + 远程注册表联动
- 默认规则：重复失败后必须补充 debug 证据

### 5. 时间线与 SQLite 状态
- timeline save/list/show/restore/push
- SQLite 持久化 task/event/session 状态
- task ref 与 rerun 具备可追踪性和可重放性
- 支持文件到 SQLite 的渐进迁移与对账

### 6. 能力资产化与场景化能力
- scene/capability inventory 与治理视图
- 能力抽取、评估、发布闭环
- 支持 scene runtime 与 ontology 驱动执行
- 支持面向 Moqui 的能力校验与 handoff 基线

---

## 快速开始

### 安装
```bash
npm install -g scene-capability-engine
```

### 在项目中启用
```bash
sce adopt
```

### 启动一个 scene 治理流程
```bash
sce studio plan --scene scene.demo --from-chat session-demo --goal "bootstrap first feature" --json
sce spec bootstrap --name 01-00-first-feature --scene scene.demo --non-interactive
sce spec pipeline run --spec 01-00-first-feature --scene scene.demo
```

### 自动闭环推进
```bash
sce auto close-loop "deliver customer + order + inventory baseline"
```

---

## 推荐使用路径

### 功能交付
```bash
sce studio plan --scene scene.customer-order --from-chat session-20260308 --goal "optimize checkout" --json
sce spec bootstrap --name 02-00-checkout-optimization --scene scene.customer-order --non-interactive
sce spec gate run --spec 02-00-checkout-optimization --scene scene.customer-order --json
```

### 程序级自动交付
```bash
sce auto close-loop-program "stabilize order lifecycle and release governance" --program-govern-until-stable --json
```

### 时间线保护
```bash
sce timeline save --summary "before risky refactor"
sce timeline list --limit 20
sce timeline restore <snapshot-id>
```

### 受保护写入
```bash
sce auth grant --scope studio:* --reason "apply approved patch" --auth-password <password> --json
sce auth status --json
```

---

## 默认治理行为

SCE 默认是强治理的。

- `studio plan` 默认执行 intake 与 scene/spec 治理，除非策略显式允许绕过
- 缺少业务场景/模块/页面/实体上下文时，SCE 必须先进入澄清，而不是把未知业务范围直接变成一刀切禁用
- 当 spec 绑定时，`verify` 和 `release` 默认执行 problem-closure 等相关门禁
- `close-loop-program` 默认带 gate 评估、fallback-chain、governance replay、auto-remediation
- co-work 基线默认开启：初始化或接管后的 SCE 项目会落地 `.sce/config/multi-agent.json` 且 `enabled=true`，但中央 coordinator 仍保持按需开启
- 状态持久化默认优先走 SQLite，而不是零散本地缓存
- 超大源文件必须定期触发重构评估；SCE 优先建议按项目给出阈值，若项目尚未设定，则默认参考 `2000 / 4000 / 10000`
- 发布默认验证走 integration gate：`npm run test:release`

---

## 关键集成点

如果你要对接 IDE、AI 助手或前端，优先关注这些接口面：

- `sce studio plan|generate|apply|verify|release`
- `sce studio events --openhands-events <path>`
- `sce task ref|show|rerun`
- `sce timeline save|list|show|restore`
- `sce capability inventory`
- `sce auth grant|status|revoke`
- SQLite 状态库：`.sce/state/sce-state.sqlite`

面向 MagicBall 的当前关键接口还包括：

- `sce app bundle list|show|register`
- `sce app registry status|configure|sync*`
- `sce app runtime show|releases|install|activate`
- `sce app engineering show|attach|hydrate|activate`
- `sce mode application|ontology|engineering home`
- `sce pm requirement|tracking|planning|change|issue ... --json`
- `sce ontology er|br|dl ... --json`
- `sce ontology triad summary --json`
- `sce assurance resource|logs|backup|config ... --json`

远端示例 registry：
- `magicball-app-bundle-registry`
- `magicball-app-service-catalog`
- 示例 app key：`customer-order-demo`

---

## 文档入口

建议先看：

- [快速开始](docs/zh/quick-start.md)
- [AI 工具快速开始](docs/quick-start-with-ai-tools.md)
- [命令参考](docs/command-reference.md)
- [自动闭环指南](docs/autonomous-control-guide.md)
- [场景运行时指南](docs/scene-runtime-guide.md)
- [多 Agent 协同指南](docs/multi-agent-coordination-guide.md)
- [Errorbook 注册表指南](docs/errorbook-registry.md)
- [文档总览](docs/zh/README.md)

Moqui 与能力矩阵相关：

- [Moqui 模板核心库 Playbook](docs/moqui-template-core-library-playbook.md)
- [Moqui 标准重建指南](docs/moqui-standard-rebuild-guide.md)
- [SCE 能力矩阵路线图](docs/sce-capability-matrix-roadmap.md)

---

## 社区

- [GitHub Discussions](https://github.com/heguangyong/scene-capability-engine/discussions)
- [GitHub Issues](https://github.com/heguangyong/scene-capability-engine/issues)

<img src="docs/images/wechat-qr.png" width="200" alt="微信群二维码">

扫码添加微信并备注 `sce` 入群。

---

## License

MIT，见 [LICENSE](LICENSE)。

---

**版本**：3.6.51
**最后更新**：2026-03-15
