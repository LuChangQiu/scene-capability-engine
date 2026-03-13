# Requirements

## Goal

以当前 SCE 的文件优先、SQLite 索引增强架构为基础，建立一套可持续推进的 selective SQLite program，只继续推进高价值状态索引与注册表，不做全量资源替换。

## Requirements

1. The program SHALL define selective SQLite advancement as the default strategy instead of blanket sqlite-ization.
2. The system SHALL preserve file artifacts as the canonical source for append-only evidence, recovery payloads, and low-cardinality personal configuration.
3. The project SHALL harden the existing migratable SQLite component set before admitting broad new migration scope.
4. The program SHALL define an explicit admission rubric for new SQLite candidates and an explicit deny list for non-candidates.
5. The program SHALL provide a phased execution model that separates policy definition, reconciliation hardening, and derived-index pilots.
6. Each sub spec in this program SHALL produce acceptance evidence, updated operator guidance, and a concrete next-step backlog.
