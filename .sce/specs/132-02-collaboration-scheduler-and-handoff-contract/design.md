# Design Document

## Design Summary

The scheduler contract sits above leases:

- leases tell who occupies scope
- scheduler tells what should run next and why something cannot proceed
- handoff tells how one agent passes work to another

This separation lets adapters build supervision surfaces without re-implementing coordination logic.
