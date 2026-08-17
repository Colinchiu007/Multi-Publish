## Why

Story2Video currently waits for the optional, read-only prompt translation job in optimize before generating assets. A slow or unavailable default LLM therefore adds unpredictable latency before the expensive ffmpeg composition work even though the translation is not required to generate or compose the video.

## What Changes

- Defer automatic-mode prompt translation until the compose stage and run it concurrently with video composition.
- Keep manual material-selection translation available before the selection checkpoint, because candidates display the translated prompt before the user confirms materials.
- Bound translation work with per-batch and overall deadlines; translation failures remain fail-open and never fail an otherwise successful video composition.
- Attach completed translations to compose output segments by stable scene index, preserve the serializable pending-job contract for retries/resume, and mark degraded translation state for diagnostics.
- Preserve the existing non-English-only display behavior, prompt length validation, JSON/markdown response parsing, and read-only Result/History rendering.
- Document data contracts, validation, lifecycle, user-visible states, and fallback behavior in the Story2Video PRD and related release/learnings documentation.

## Capabilities

### New Capabilities

- story2video-prompt-translation-compose-parallel: Defines deferred prompt translation, compose-stage concurrency, bounded fail-open behavior, segment alignment, resume semantics, and observable progress/diagnostic state.

### Modified Capabilities

- None. Existing translation display and manual-selection behavior remain compatible; the change adds an automatic-mode scheduling contract.

## Impact

- Runtime: apps/desktop/electron/services/story2video-stages.js, apps/desktop/electron/services/stage-executor.js, and the Story2Video stage definition in pipeline-engine.js.
- Tests: Story2Video stage, StageExecutor, and pipeline contract suites, including deadline, index alignment, manual checkpoint, resume, and compose-failure cases.
- Product behavior: automatic Story2Video starts asset generation without waiting for display-only translations; the final result shows translations when available and otherwise keeps the original English prompt without blocking video delivery.
- Documentation: 01-docs/PRD.md, Story2Video-specific PRD documentation if present, CHANGELOG.md, 01-docs/learnings.md, and the i18n glossary where new user-facing terminology is introduced.
