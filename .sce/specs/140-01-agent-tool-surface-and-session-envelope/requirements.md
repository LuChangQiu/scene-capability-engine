# Requirements Document

## Introduction

The first implementation step for external or embedded agent runtime support should define one canonical tool surface and one canonical session envelope.

This is the smallest runtime-neutral core that IDE embedded runtimes, CLI bridges, and optional MCP bindings can all share.

## Requirements

### Requirement 1: Publish One Canonical Agent Tool Surface

**User Story:** As an external or embedded agent runtime, I want one canonical tool surface, so that I can consume SCE capabilities without vendor-specific protocol drift.

#### Acceptance Criteria

1. SCE SHALL define one canonical tool surface covering `scene/spec/task/event/project/lease`
2. The tool surface SHALL distinguish read-only tools from write-capable tools
3. The schema SHALL remain runtime-neutral and machine-readable

### Requirement 2: Publish One Canonical Session Envelope

**User Story:** As an adapter, I want one canonical session envelope, so that any runtime backend can be projected back into SCE using stable semantics.

#### Acceptance Criteria

1. SCE SHALL define canonical `started`, `progress`, `blocked`, `completed`, and `failed` session envelopes
2. The envelope SHALL include session identity, routing identity, stage, status, summary, and optional raw payload reference
3. The envelope SHALL not depend on vendor-private field names

### Requirement 3: Keep Transport Binding Optional

**User Story:** As a maintainer, I want transport binding to stay secondary, so that the engine contract is not tied to MCP-only deployment.

#### Acceptance Criteria

1. The canonical contract SHALL be transport-agnostic
2. MCP MAY be documented as one binding
3. CLI bridge or process bridge MAY be documented as alternative bindings
