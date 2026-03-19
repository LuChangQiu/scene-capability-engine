# Design Document

## Design Summary

This spec keeps collaboration inside the existing scene/spec/task/event operating model:

- raw events remain append-friendly and auditable
- supervision projection provides compact cross-tool consumption
- adapters can render compact, standard, or detailed views from the same semantic source
