## 1. Contract and scheduling

- [x] 1.1 Add the deferred translation pending payload contract and automatic/manual mode decision to Story2Video stage tests.
- [x] 1.2 Add the optional compose parallel-task hook without changing behavior for non-opt-in pipelines.
- [x] 1.3 Start translation and compose concurrently, enforce bounded translation deadlines, and apply results by scene index.
- [x] 1.4 Persist completed/degraded translation metadata in JSON-safe run context and support compose retry/resume behavior.

## 2. Regression protection

- [x] 2.1 Cover automatic optimize non-blocking behavior, English-locale skip, valid overlap, partial/out-of-order results, timeout, provider failure, and compose failure.
- [x] 2.2 Cover manual candidate translation before the material-selection checkpoint.
- [x] 2.3 Cover pipeline stage type/definition and generic StageExecutor compatibility contracts.

## 3. Documentation and quality gates

- [x] 3.1 Update Story2Video PRD with data validation, pipeline flow, interaction/display states, copy, and fallback rules.
- [x] 3.2 Update related PRD/version notes, CHANGELOG.md, 01-docs/learnings.md, and glossary if needed.
- [x] 3.3 Run focused tests, desktop build/package/ASAR checks, quality-gates self-check, and code review.
- [ ] 3.4 Push branch, open and merge PR, verify live remote status, archive OpenSpec/CCG task, and update memory.
