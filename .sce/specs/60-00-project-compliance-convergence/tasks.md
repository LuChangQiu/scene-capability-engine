# Implementation Plan: Project Compliance Convergence

## Tasks

- [x] 1 Relocate root non-compliant markdown files into docs
  - Moved `OFFLINE_INSTALL.md` and `交付清单.md` into `docs/`.

- [x] 2 Normalize spec misplaced artifacts into allowed subdirectories
  - Moved completion/release/setup notes under `reports/` where required.
  - Moved `22-00` non-standard `template-repo` into `custom/template-repo`.

- [x] 3 Clear lock artifact compliance noise
  - Released lock on `35-00-spec-locking-mechanism` and verified no active locks.

- [x] 4 Converge status to full completion
  - Ensured all specs expose complete marker-based task status and report 100%.

- [x] 5 Verify compliance and regression
  - `sce doctor --docs` shows compliant.
  - `sce status` shows compliant + all specs 100%.
  - Ran targeted and full test suites successfully.
