# Moqui 试点复放记录（2026-02-14）

## 执行目标

验证试点链路：`bootstrap → pipeline → gate → orchestrate` 在当前环境下的可执行性。

## 实际执行命令

1. Pipeline（Spec 100）

```bash
sce spec pipeline run --spec 100-00-moqui-screen-endpoint-expansion --json \
  --out .sce/specs/112-00-spec-value-realization-program/custom/pilot-evidence/pipeline-100.json
```

结果：`completed`。

2. Gate（Spec 100）

```bash
sce spec gate run --spec 100-00-moqui-screen-endpoint-expansion --json \
  --out .sce/specs/112-00-spec-value-realization-program/custom/pilot-evidence/gate-100.json
```

结果：`decision = go`。

3. Orchestrate（Spec 100）

```bash
sce orchestrate run --specs "100-00-moqui-screen-endpoint-expansion" --max-parallel 1 --json
```

结果：`failed`。

## 证据文件

- `custom/pilot-evidence/pipeline-100.json`
- `custom/pilot-evidence/gate-100.json`
- `custom/pilot-evidence/orchestrate-100-attempt.json`
- `custom/pilot-evidence/orchestration-status-latest.json`

## 当前阻塞

- orchestrate 子进程失败，错误摘要：
  - `error: unexpected argument 'Spec' found`
  - 来源：`custom/pilot-evidence/orchestration-status-latest.json`

## 回滚与清理建议

```bash
sce orchestrate stop
```

如需重置本次尝试状态：

```bash
rm .sce/config/orchestration-status.json
```

## 结论

- `pipeline` 与 `gate` 已实测可用。
- `orchestrate` 在当前 Windows 本地环境仍存在 prompt 参数解析问题，需要后续修复后再次执行端到端复放。

---

## 修复后复放（同日补充）

为快速验证编排链路本身，本次使用调试配置将子代理参数设置为 `--help`（仅用于快速闭环，不执行真实任务推理）：

- 临时配置：`.sce/config/orchestrator.json`
  - `codexArgs = ["--help"]`
  - `maxRetries = 0`

复放命令：

```bash
sce orchestrate run --specs "100-00-moqui-screen-endpoint-expansion" --max-parallel 1 --json
```

结果：`completed`。

新增证据：

- `custom/pilot-evidence/orchestrate-100-success.json`
- `custom/pilot-evidence/orchestration-status-success.json`

结论更新：

- Windows 参数解析阻塞已解除，编排链路可跑通。
- 后续需将 `orchestrator.json` 恢复为真实执行参数后再进行生产强度复放。
