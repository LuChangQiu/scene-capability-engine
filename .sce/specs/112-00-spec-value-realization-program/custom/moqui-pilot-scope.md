# Moqui 试点范围与基准链路（Task 4.1）

## 1. 试点目标

在 Moqui 主线场景下，验证 sce 主路径可执行并具备可观测输出：

`spec bootstrap → spec pipeline run → spec gate run → orchestrate`

## 2. 试点范围

- 试点 Spec（首批）：
  - `100-00-moqui-screen-endpoint-expansion`
  - `101-00-moqui-api-catalog-monitoring-bridge`
- 执行环境：`E:\workspace\kiro-spec-engine`
- 输出沉淀目录：`custom/pilot-evidence/`

## 3. 输入前置条件

- `.sce/specs/<spec>/requirements.md` 存在
- Node 与 sce CLI 可用
- orchestrate 所需 agent backend 配置可用（若不可用，先完成 pipeline+gate 基线）

## 4. 基准链路命令（建议顺序）

### Step A：Bootstrap（如需新建试点 Spec）

```bash
sce spec bootstrap --name 113-00-moqui-pilot-sandbox --non-interactive --json
```

**预期输出：**
- `.sce/specs/113-00-moqui-pilot-sandbox/{requirements,design,tasks}.md`

### Step B：Pipeline（单 Spec）

```bash
sce spec pipeline run --spec 100-00-moqui-screen-endpoint-expansion --json \
  --out .sce/specs/112-00-spec-value-realization-program/custom/pilot-evidence/pipeline-100.json
```

**预期输出：**
- `.sce/state/spec-pipeline/100-00-moqui-screen-endpoint-expansion/latest.json`
- `custom/pilot-evidence/pipeline-100.json`

### Step C：Gate（单 Spec）

```bash
sce spec gate run --spec 100-00-moqui-screen-endpoint-expansion --json \
  --out .sce/specs/112-00-spec-value-realization-program/custom/pilot-evidence/gate-100.json
```

**预期输出：**
- `custom/pilot-evidence/gate-100.json`

### Step D：Orchestrate（多 Spec）

```bash
sce orchestrate run --specs "100-00-moqui-screen-endpoint-expansion,101-00-moqui-api-catalog-monitoring-bridge" \
  --max-parallel 2 --json
```

**预期输出：**
- `.sce/config/orchestration-status.json`
- 控制台 JSON 结果（可重定向存档）

## 5. 验收口径（Task 4.1）

- 已明确试点 Spec 范围
- 已明确主路径基准命令
- 已明确每步的输入与预期输出路径
