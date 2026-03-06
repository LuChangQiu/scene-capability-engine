# Magicball Contract Index

Schema references:
- `docs/agent-runtime/magicball-status.schema.json`
- `docs/agent-runtime/magicball-task-feedback.schema.json`
- `docs/agent-runtime/magicball-timeline-view.schema.json`
- `docs/agent-runtime/capability-iteration-ui.schema.json`

Recommended consumption order:
1. `magicball-status.schema.json`
2. `magicball-task-feedback.schema.json`
3. `magicball-timeline-view.schema.json`
4. `capability-iteration-ui.schema.json`

Usage mapping:
- Task cards: `task.feedback_model`
- Timeline panels: `timeline list/show -> view_model`
- Capability inventory homepage: `capability inventory`

Implementation modules:
- `lib/magicball/status-language.js`
- `lib/magicball/task-feedback-model.js`
- `lib/magicball/capability-inventory-view-model.js`
- `lib/magicball/timeline-view-model.js`
- `lib/capability/inventory-service.js`
