# Design Document

## Design Summary

Observe and document agents may share a workspace under lease policy.

Implementation agents need a dedicated runtime binding model so adapters can:

- supervise where code changes happen
- understand merge readiness
- warn when implementation is still running in a shared workspace

This spec does not force one UI, only one engine-owned runtime contract.
