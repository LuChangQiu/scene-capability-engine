# Requirements

## Goal

建立 steering 自身的监管机制，使其能够持续精简、纠偏和防止规则腐化。

## Requirements

1. The system SHALL define a stable review cadence for steering hygiene.
2. The system SHALL audit steering content, not only steering directory structure.
3. The audit SHALL detect oversized steering files, stale history, task/checklist leakage, and stable-layer spec leakage.
4. The audit SHALL warn when steering introduces non-canonical aliases for existing governance mechanisms such as `errorbook`.
5. The project SHALL document how to decide whether content should be kept, merged, moved, or deleted.
6. The default steering baseline and template SHALL be refactored to pass the new audit.
7. CI SHALL run the steering audit on normal validation, and a scheduled workflow SHALL run it periodically.
