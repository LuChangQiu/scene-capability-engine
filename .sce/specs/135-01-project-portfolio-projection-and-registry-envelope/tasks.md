# Tasks Document

## T1 Define the portfolio envelope
- [x] Lock the `ProjectPortfolioProjection` shape
- [x] Lock stable `ProjectPortfolioRecord` identity fields

## T2 Define the command
- [x] Lock `sce project portfolio show --json`
- [x] Lock caller-context and error behavior for partial visibility

## T3 Keep compatibility
- [x] Reuse `16-00` workspace semantics instead of replacing them
- [x] Keep multi-repo compatibility with `24-00`
- [x] Keep project activity fields compatible with `132-*`
