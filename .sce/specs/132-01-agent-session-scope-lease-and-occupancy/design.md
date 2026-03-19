# Design Document

## Design Summary

This spec upgrades older multi-agent locking semantics toward a more adapter-friendly model:

- session registry for runtime identity
- semantic lease contract for collaboration
- occupancy projection for supervision surfaces

File locking remains internal protection, but the primary outward-facing contract is semantic occupancy.

## Notes

- session registry and lease state should remain compatible with future SQLite-backed runtime storage
- adapters should not need to parse lock files directly
