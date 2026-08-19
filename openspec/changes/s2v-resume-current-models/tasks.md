## 1. Contract and tests
- [x] 1.1 Add resume tests proving stale image/TTS/video routing is removed while content parameters remain.
- [x] 1.2 Add Story2Video tests proving completed image/audio/video paths are reused and incomplete calls use current capability models.
- [x] 1.3 Add tests for old snapshots without model metadata and for old video_plan provider/model values.
- [x] 1.4 Add voice compatibility regression coverage using existing catalog/model mismatch contracts; runtime keeps the existing fail-closed/re-clone contract and adjacent compatibility suites remain the source of truth.
## 2. Runtime implementation
- [x] 2.1 Mark restored orchestrator params for current-model routing and sanitize stale model fields.
- [x] 2.2 Apply the marker in runtime stage option resolution and Story2Video video-plan resolution.
- [x] 2.3 Keep successful local asset reuse ahead of provider calls and preserve existing fallback/error behavior.
## 3. Documentation and delivery
- [x] 3.1 Update PRD and architecture documentation with validation, flow, interaction, display/copy and risk rules.
- [x] 3.2 Update changelogs and 01-docs/learnings.md with QM-5 root cause, escape analysis, regression protection and prevention.
- [x] 3.3 Run focused tests, quality gates, Electron packaging/ASAR checks and dual-model review with documented degradation if external backends remain unavailable.
- [ ] 3.4 Push, open/merge PR, verify remote main, archive OpenSpec/CCG task and record remoteStatus.
