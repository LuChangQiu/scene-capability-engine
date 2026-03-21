# Requirements Document

## Introduction

After tool/session and write safety contracts are in place, SCE needs one bounded supervision layer that shows what external or embedded runtimes currently occupy.

## Requirements

### Requirement 1: Publish External Runtime Occupancy Projection

**User Story:** As an IDE or supervisor, I want to see what an external runtime currently occupies, so that co-work and supervision stay visible.

#### Acceptance Criteria

1. SCE SHALL publish occupancy records for external or embedded runtimes
2. Records SHALL include backend, session identity, scope, project identity, status, and updated time
3. The projection SHALL be machine-readable and adapter-neutral

### Requirement 2: Integrate With Existing Supervision Model

**User Story:** As a maintainer, I want external runtime occupancy to extend existing supervision semantics, so that SCE does not create a parallel supervision plane.

#### Acceptance Criteria

1. Occupancy SHALL roll into canonical supervision projection
2. The contract SHALL not invent a second independent supervision registry
3. Missing projection details SHALL be explicit rather than silently guessed
