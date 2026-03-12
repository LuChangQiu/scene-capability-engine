# MoltBot 功能借鉴分析

**核心问题**: MoltBot 有哪些**功能**值得 sce 借鉴？

**sce 核心定位**:
> AI 驱动引擎，通过结构化文档驱动命令增强各行业效能（开发、运维、方案撰写等）

---

## 1. MoltBot 核心功能清单

### 1.1 Gateway 控制平面

**功能**:
- WebSocket 控制平面
- 会话管理（main/group/isolated sessions）
- 配置管理（集中式配置）
- Cron 调度（定时任务）
- Webhook 支持
- 事件系统

**技术实现**:
```javascript
// Gateway 提供统一的控制接口
gateway.sessions.create()
gateway.sessions.list()
gateway.sessions.send()
gateway.cron.schedule()
gateway.webhooks.register()
```

### 1.2 多代理路由 (Multi-Agent Routing)

**功能**:
- 将不同渠道/账号/对话路由到隔离的代理
- 每个代理有独立的工作区和会话
- Agent to Agent 通信（sessions_* 工具）

**架构**:
```
Inbound Message
    │
    ▼
┌─────────────────┐
│  Router         │
│  - Channel      │
│  - Account      │
│  - Peer         │
└─────────────────┘
    │
    ├─→ Agent A (Workspace A)
    ├─→ Agent B (Workspace B)
    └─→ Agent C (Workspace C)
```

### 1.3 Skills 平台

**功能**:
- Bundled skills (内置技能)
- Managed skills (托管技能)
- Workspace skills (工作区技能)
- ClawdHub 注册表（搜索和安装）
- 技能安装门控

**技能示例**:
```yaml
# skill.yaml
name: gmail-automation
version: 1.0.0
description: Gmail automation tools
tools:
  - gmail.search
  - gmail.send
  - gmail.label
dependencies:
  - googleapis
permissions:
  - gmail.readonly
  - gmail.send
```

### 1.4 工具系统

**Browser 控制**:
- 专用 Chrome/Chromium 实例
- 快照、操作、上传
- 配置文件管理

**Canvas (A2UI)**:
- 代理驱动的可视化工作区
- Push/reset/eval/snapshot
- 实时渲染

**Nodes (设备能力)**:
- 相机拍照/录像
- 屏幕录制
- 位置获取
- 通知发送
- 系统命令执行

**Cron + Webhooks**:
- 定时任务调度
- Webhook 触发
- Gmail Pub/Sub 集成

### 1.5 会话模型

**会话类型**:
- **Main session**: 直接聊天（完全权限）
- **Group session**: 群组对话（受限权限）
- **Isolated session**: 隔离会话（沙箱）

**激活模式**:
- Mention gating (需要提及)
- Reply tags (回复标记)
- Queue modes (队列模式)

### 1.6 安全沙箱

**Docker 沙箱**:
```javascript
{
  "sandbox": {
    "mode": "non-main",  // 非主会话沙箱化
    "allowlist": ["bash", "read", "write"],
    "denylist": ["browser", "canvas", "nodes"]
  }
}
```

**权限控制**:
- 工具白名单/黑名单
- DM 访问控制
- 群组规则

### 1.7 远程访问

**Tailscale 集成**:
- Tailscale Serve (tailnet-only)
- Tailscale Funnel (public)
- Gateway 保持 loopback 绑定

**远程 Gateway**:
- Linux 实例运行 Gateway
- 客户端通过 Tailscale/SSH 连接
- 设备节点按需配对

---

## 2. 功能借鉴分析

### 2.1 ⭐⭐⭐⭐⭐ 多工作区/多项目管理

**MoltBot 功能**: Multi-Agent Routing

**sce 可以借鉴**:
```bash
# 当前 sce 是单项目的
cd project-a
sce status  # 只看当前项目

# 可以增强为多项目管理
sce workspace list
sce workspace switch project-a
sce workspace status --all  # 查看所有项目状态
```

**具体功能**:

1. **工作区管理**:
   ```bash
   sce workspace create my-project
   sce workspace list
   sce workspace switch my-project
   sce workspace remove my-project
   ```

2. **跨项目操作**:
   ```bash
   # 在所有项目中搜索 Spec
   sce search "user authentication" --all-workspaces
   
   # 批量状态检查
   sce status --all-workspaces
   
   # 跨项目 Spec 复用
   sce spec copy project-a/01-00-auth project-b/05-00-auth
   ```

3. **工作区配置**:
   ```json
   // ~/.sce/workspaces.json
   {
     "workspaces": [
       {
         "name": "project-a",
         "path": "/path/to/project-a",
         "type": "nodejs",
         "active": true
       },
       {
         "name": "project-b",
         "path": "/path/to/project-b",
         "type": "python",
         "active": false
       }
     ]
   }
   ```

**价值**:
- 开发者通常同时维护多个项目
- 跨项目 Spec 复用
- 统一管理和监控

**优先级**: ⭐⭐⭐⭐⭐

---

### 2.2 ⭐⭐⭐⭐⭐ Cron 定时任务系统

**MoltBot 功能**: Cron + Wakeups

**sce 可以借鉴**:
```bash
# 定时任务管理
sce cron add "0 9 * * *" "sce doctor --docs"
sce cron add "0 0 * * 0" "sce docs stats --report"
sce cron list
sce cron remove <id>
```

**具体功能**:

1. **定时检查**:
   ```bash
   # 每天早上检查文档合规性
   sce cron add "0 9 * * *" "sce doctor --docs --notify"
   
   # 每周生成项目报告
   sce cron add "0 0 * * 0" "sce report generate --email"
   
   # 每小时检查 Spec 状态
   sce cron add "0 * * * *" "sce status --check-stale"
   ```

2. **自动化工作流**:
   ```bash
   # 每天自动运行 Ultrawork 质量检查
   sce cron add "0 10 * * *" "sce enhance check-all"
   
   # 定期清理临时文件
   sce cron add "0 2 * * *" "sce docs cleanup --dry-run=false"
   ```

3. **通知集成**:
   ```bash
   # 检查结果通知到 Slack/Email
   sce cron add "0 9 * * *" "sce doctor --notify slack"
   ```

**实现方式**:
- 使用系统 cron (Linux/Mac)
- 使用 Task Scheduler (Windows)
- 或内置调度器

**价值**:
- 自动化日常检查
- 定期质量保证
- 减少手动操作

**优先级**: ⭐⭐⭐⭐⭐

---

### 2.3 ⭐⭐⭐⭐⭐ Webhook 系统

**MoltBot 功能**: Webhooks

**sce 可以借鉴**:
```bash
# Webhook 管理
sce webhook add github-push https://api.github.com/repos/...
sce webhook add ci-complete https://ci.example.com/...
sce webhook list
sce webhook test <id>
```

**具体功能**:

1. **CI/CD 集成**:
   ```bash
   # GitHub Actions 完成后触发
   sce webhook add github-ci \
     --event ci-complete \
     --action "sce status update"
   
   # 部署完成后更新 Spec
   sce webhook add deploy-complete \
     --event deploy \
     --action "sce spec mark-deployed"
   ```

2. **外部工具集成**:
   ```bash
   # Jira issue 创建时自动创建 Spec
   sce webhook add jira-issue \
     --event issue.created \
     --action "sce spec create-from-issue"
   
   # Slack 消息触发操作
   sce webhook add slack-command \
     --event slack.command \
     --action "sce status --format slack"
   ```

3. **自动化流程**:
   ```bash
   # PR 合并后自动归档 Spec
   sce webhook add pr-merged \
     --event pr.merged \
     --action "sce docs archive --auto"
   ```

**配置示例**:
```json
// .sce/webhooks.json
{
  "webhooks": [
    {
      "id": "github-ci",
      "event": "ci-complete",
      "url": "https://api.github.com/repos/user/repo/statuses",
      "action": "sce status update",
      "enabled": true
    }
  ]
}
```

**价值**:
- 与现有工具链集成
- 自动化工作流
- 减少上下文切换

**优先级**: ⭐⭐⭐⭐⭐

---

### 2.4 ⭐⭐⭐⭐ Skills/Extensions 平台

**MoltBot 功能**: Skills Platform + ClawdHub

**sce 可以借鉴**:
```bash
# Spec 模板/扩展管理
sce extension install spec-template-rest-api
sce extension install quality-checker
sce extension list
sce extension search "authentication"
```

**具体功能**:

1. **Spec 模板库**:
   ```bash
   # 安装常用 Spec 模板
   sce extension install spec-template-user-auth
   sce extension install spec-template-rest-api
   sce extension install spec-template-react-component
   
   # 使用模板创建 Spec
   sce spec create 05-00-user-login --template user-auth
   ```

2. **质量检查扩展**:
   ```bash
   # 安装质量检查工具
   sce extension install quality-gate-security
   sce extension install quality-gate-performance
   
   # 运行扩展
   sce enhance check --extension security
   ```

3. **行业特定扩展**:
   ```bash
   # 金融行业合规检查
   sce extension install compliance-fintech
   
   # 医疗行业 HIPAA 检查
   sce extension install compliance-hipaa
   
   # 运行合规检查
   sce doctor --extension compliance-fintech
   ```

4. **自定义扩展**:
   ```bash
   # 创建自定义扩展
   sce extension create my-custom-checker
   
   # 发布到社区
   sce extension publish my-custom-checker
   ```

**扩展结构**:
```
.sce/extensions/
├── spec-templates/
│   ├── user-auth/
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   └── rest-api/
├── quality-checkers/
│   ├── security/
│   │   └── checker.js
│   └── performance/
└── compliance/
    └── fintech/
```

**价值**:
- 最佳实践复用
- 行业特定支持
- 社区贡献
- 可扩展性

**优先级**: ⭐⭐⭐⭐

---

### 2.5 ⭐⭐⭐⭐ 会话/上下文管理

**MoltBot 功能**: Session Model (main/group/isolated)

**sce 可以借鉴**:
```bash
# 上下文管理
sce context create feature-a
sce context switch feature-a
sce context list
sce context merge feature-a feature-b
```

**具体功能**:

1. **多上下文支持**:
   ```bash
   # 为不同功能创建独立上下文
   sce context create user-auth
   sce context create payment-system
   
   # 切换上下文
   sce context switch user-auth
   
   # 在特定上下文中工作
   sce spec create 01-00-login --context user-auth
   ```

2. **上下文隔离**:
   ```bash
   # 每个上下文有独立的：
   # - Specs
   # - 配置
   # - 历史记录
   # - AI 对话历史
   
   sce context export user-auth --output user-auth-context.json
   sce context import payment-context.json
   ```

3. **上下文协作**:
   ```bash
   # 跨上下文引用
   sce spec reference user-auth/01-00-login
   
   # 合并上下文
   sce context merge feature-a feature-b --output feature-ab
   ```

**配置示例**:
```json
// .sce/contexts.json
{
  "contexts": [
    {
      "name": "user-auth",
      "specs": ["01-00-login", "02-00-register"],
      "active": true,
      "created": "2026-01-28"
    },
    {
      "name": "payment",
      "specs": ["03-00-stripe", "04-00-refund"],
      "active": false,
      "created": "2026-01-28"
    }
  ]
}
```

**价值**:
- 大型项目的上下文隔离
- 并行开发多个功能
- 清晰的关注点分离

**优先级**: ⭐⭐⭐⭐

---

### 2.6 ⭐⭐⭐ 远程协作支持

**MoltBot 功能**: Remote Gateway + Tailscale

**sce 可以借鉴**:
```bash
# 远程协作
sce remote start
sce remote connect team-server
sce remote share spec 01-00-user-auth
```

**具体功能**:

1. **远程 sce 服务器**:
   ```bash
   # 在服务器上运行 sce daemon
   sce daemon start --port 8080
   
   # 客户端连接
   sce remote connect https://sce-server.example.com
   
   # 远程操作
   sce status --remote
   sce spec list --remote
   ```

2. **团队协作**:
   ```bash
   # 共享 Spec
   sce share spec 01-00-user-auth --team
   
   # 协作编辑
   sce spec edit 01-00-user-auth --collaborative
   
   # 查看团队活动
   sce activity --team
   ```

3. **Spec 同步**:
   ```bash
   # 推送到远程
   sce push spec 01-00-user-auth
   
   # 从远程拉取
   sce pull spec 02-00-payment
   
   # 同步所有
   sce sync --all
   ```

**价值**:
- 团队协作
- Spec 共享
- 统一管理

**优先级**: ⭐⭐⭐

---

### 2.7 ⭐⭐⭐ 事件系统

**MoltBot 功能**: Event System

**sce 可以借鉴**:
```bash
# 事件监听和触发
sce event listen spec.created
sce event trigger spec.completed --data '{"spec": "01-00"}'
```

**具体功能**:

1. **事件类型**:
   ```bash
   # Spec 生命周期事件
   - spec.created
   - spec.updated
   - spec.completed
   - spec.archived
   
   # 文档事件
   - doc.compliance.failed
   - doc.quality.low
   
   # 系统事件
   - project.adopted
   - backup.created
   ```

2. **事件处理**:
   ```bash
   # 监听事件并执行操作
   sce event on spec.completed \
     --action "sce docs archive --spec {spec}"
   
   sce event on doc.compliance.failed \
     --action "sce notify slack --message 'Compliance failed'"
   ```

3. **事件日志**:
   ```bash
   # 查看事件历史
   sce event log
   sce event log --type spec.created
   sce event log --since "2026-01-01"
   ```

**配置示例**:
```json
// .sce/events.json
{
  "handlers": [
    {
      "event": "spec.completed",
      "action": "sce docs archive --spec {spec}",
      "enabled": true
    },
    {
      "event": "doc.compliance.failed",
      "action": "sce notify slack",
      "enabled": true
    }
  ]
}
```

**价值**:
- 自动化工作流
- 事件驱动架构
- 可扩展性

**优先级**: ⭐⭐⭐

---

### 2.8 ⭐⭐ 沙箱执行环境

**MoltBot 功能**: Docker Sandbox

**sce 可以借鉴**:
```bash
# 在沙箱中执行命令
sce sandbox run "npm test"
sce sandbox run "python script.py" --isolated
```

**具体功能**:

1. **隔离执行**:
   ```bash
   # 在 Docker 容器中运行测试
   sce sandbox run "npm test" --image node:22
   
   # 隔离运行脚本
   sce sandbox run "python enhance.py" --isolated
   ```

2. **安全检查**:
   ```bash
   # 在沙箱中运行质量检查
   sce enhance check --sandbox
   
   # 安全地运行第三方扩展
   sce extension run untrusted-checker --sandbox
   ```

**价值**:
- 安全执行不受信任的代码
- 隔离环境测试
- 保护主机系统

**优先级**: ⭐⭐ (对于 sce 不是核心需求)

---

## 3. 功能优先级总结

### 3.1 高优先级 (⭐⭐⭐⭐⭐)

1. **多工作区/多项目管理**
   - 开发者常见需求
   - 跨项目 Spec 复用
   - 相对容易实现

2. **Cron 定时任务系统**
   - 自动化日常检查
   - 定期质量保证
   - 提升效能的关键

3. **Webhook 系统**
   - CI/CD 集成
   - 外部工具集成
   - 自动化工作流

### 3.2 中优先级 (⭐⭐⭐⭐)

4. **Skills/Extensions 平台**
   - Spec 模板复用
   - 行业特定支持
   - 社区生态

5. **会话/上下文管理**
   - 大型项目支持
   - 并行开发
   - 上下文隔离

### 3.3 低优先级 (⭐⭐⭐)

6. **远程协作支持**
   - 团队协作
   - 需要服务器基础设施

7. **事件系统**
   - 事件驱动架构
   - 可扩展性

### 3.4 可选 (⭐⭐)

8. **沙箱执行环境**
   - 对 sce 不是核心需求

---

## 4. 具体实施建议

### 4.1 Phase 1: 基础增强 (1-2 周)

**目标**: 实现最高优先级功能的 MVP

1. **多工作区管理**:
   ```bash
   sce workspace create <name>
   sce workspace list
   sce workspace switch <name>
   ```

2. **Cron 基础**:
   ```bash
   sce cron add "<schedule>" "<command>"
   sce cron list
   sce cron remove <id>
   ```

3. **Webhook 基础**:
   ```bash
   sce webhook add <name> <url>
   sce webhook list
   sce webhook test <id>
   ```

### 4.2 Phase 2: 生态建设 (1-2 月)

**目标**: 建立扩展生态

1. **Extensions 平台**:
   - Spec 模板库
   - 质量检查扩展
   - 安装和管理机制

2. **上下文管理**:
   - 多上下文支持
   - 上下文切换
   - 上下文导出/导入

### 4.3 Phase 3: 高级功能 (3-6 月)

**目标**: 团队协作和高级自动化

1. **远程协作**:
   - sce daemon
   - 远程连接
   - Spec 同步

2. **事件系统**:
   - 事件监听
   - 事件处理
   - 事件日志

---

## 5. 与 sce 核心定位的契合度

### 5.1 完全契合 (⭐⭐⭐⭐⭐)

- **多工作区管理**: 支持多项目效能提升
- **Cron 定时任务**: 自动化检查，提升效能
- **Webhook 系统**: 工具链集成，提升效能
- **Extensions 平台**: 行业特定支持，提升效能

### 5.2 部分契合 (⭐⭐⭐)

- **上下文管理**: 大型项目支持
- **事件系统**: 自动化工作流
- **远程协作**: 团队效能提升

### 5.3 不太契合 (⭐⭐)

- **沙箱执行**: sce 不是执行引擎

---

## 6. 总结

### 6.1 最值得借鉴的 3 个功能

1. **⭐⭐⭐⭐⭐ 多工作区/多项目管理**
   - 最实用
   - 最容易实现
   - 最大价值

2. **⭐⭐⭐⭐⭐ Cron 定时任务系统**
   - 自动化核心
   - 提升效能关键
   - 减少手动操作

3. **⭐⭐⭐⭐⭐ Webhook 系统**
   - 工具链集成
   - 自动化工作流
   - 扩展性强

### 6.2 核心价值

这些功能都围绕 sce 的核心定位：
> **通过结构化文档驱动命令增强各行业效能**

- **多工作区**: 提升多项目管理效能
- **Cron**: 自动化提升效能
- **Webhook**: 集成提升效能
- **Extensions**: 行业特定效能提升

### 6.3 不建议借鉴的功能

- 消息平台集成（WhatsApp/Telegram）
- 语音交互
- Canvas 可视化
- 设备节点（相机/麦克风）

**原因**: 这些是 MoltBot 作为 "Personal OS" 的特性，与 sce 作为 "AI 驱动引擎" 的定位不符。

---

## 7. 下一步

建议优先实现：

1. **多工作区管理** (Spec 16-00)
2. **Cron 定时任务** (Spec 17-00)
3. **Webhook 系统** (Spec 18-00)

每个功能都可以独立成为一个 Spec，按优先级逐步实现。

