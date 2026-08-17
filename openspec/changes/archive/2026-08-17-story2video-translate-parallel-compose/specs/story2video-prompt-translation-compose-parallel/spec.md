## Purpose

This capability makes optional Story2Video prompt translations overlap with the long video composition stage while preserving deterministic scene alignment, bounded failure behavior, manual-selection usability, and resumable pipeline state.

## ADDED Requirements

### Requirement: Automatic translation SHALL be deferred to composition

For a non-English UI locale in automatic material mode, the pipeline SHALL finish prompt optimization without waiting for display-only prompt translation. It SHALL record a JSON-serializable pending translation payload containing the normalized UI locale and the optimized prompt list, and SHALL start the translation task when the Story2Video compose stage begins.

#### Scenario: Automatic mode starts asset generation without translation latency
- WHEN optimize succeeds, the UI locale is non-English, and creation mode is automatic
- THEN optimize returns its optimized prompt output, records the pending translation payload, and does not call the translation LLM before the next stage

#### Scenario: English locale skips translation
- WHEN the effective UI locale is en or missing
- THEN the pipeline does not create a pending translation job and no translated prompt field is required

### Requirement: Translation SHALL run concurrently with composition

The compose stage SHALL start the pending translation task and the video composition task without serially waiting for one to finish before starting the other. The translation task SHALL not change image, video, audio, subtitle, or output-video composition inputs.

#### Scenario: Compose and translation overlap
- WHEN automatic mode has a valid pending translation payload and compose starts
- THEN the LLM translation request and composeVideo are both started before either task is awaited for final output

#### Scenario: Composition failure remains authoritative
- WHEN composeVideo fails
- THEN the stage returns the compose failure, does not report a successful video, and does not allow a translation result to mask or replace the compose error

### Requirement: Translation SHALL be bounded and fail open

Each translation batch SHALL have a finite timeout and the whole translation job SHALL have a finite deadline or bounded final grace period. A missing provider, timeout, malformed response, empty response, or batch exception SHALL produce translation null for affected scenes, record a degraded diagnostic, and SHALL NOT fail a successful compose.

#### Scenario: Slow translation exceeds its deadline
- WHEN translation remains unresolved after the configured batch/deadline budget while composition succeeds
- THEN compose succeeds, affected segments retain promptTranslation null, and the run records a translation-degraded reason

#### Scenario: Valid translation completes within compose
- WHEN translation returns valid non-empty strings before the bounded finalization point
- THEN the translations are retained and no degraded state is recorded for those scenes

### Requirement: Translations SHALL align by stable scene index

Completed translations SHALL be applied by the source scene index, not by completion order or array position after filtering. The result SHALL preserve the original prompt and media fields when a translation is absent.

#### Scenario: Out-of-order translation responses
- WHEN translation results arrive in an order different from scene order
- THEN each compose output segment receives only the translation whose index matches that segment

#### Scenario: Partial translation response
- WHEN only some scene indexes have valid translated strings
- THEN valid indexes are persisted, missing indexes remain null, and composition/output persistence continues

### Requirement: Manual material selection SHALL retain pre-checkpoint translations

When creation mode requires a user material-selection checkpoint, prompt translations SHALL remain available when candidate scenes are shown. Deferring those translations to the later compose stage SHALL NOT remove or blank the candidate-panel translation field.

#### Scenario: Manual candidates show translations before confirmation
- WHEN manual candidate generation completes for a non-English UI locale
- THEN candidate scenes retain their existing promptTranslation values before the selection checkpoint is presented

### Requirement: Pending translation state SHALL support retry and resume

The pending payload and completed/degraded translation metadata SHALL be JSON-serializable and safe to persist in run checkpoints. On compose retry or process restart, a pending job without completed translations SHALL be recreated from the payload; an existing completed translation result SHALL not be silently replaced by an empty result.

#### Scenario: Resume during compose
- WHEN a run is restored from a compose-stage checkpoint with a pending payload and no completed translations
- THEN the resumed compose stage starts a new bounded translation task and continues to produce a valid compose result

#### Scenario: Resume with completed translations
- WHEN a restored run already contains valid prompt_translations
- THEN the compose stage reuses those values and does not replace them with null values solely because a new translation call is unavailable

### Requirement: User-facing translation display SHALL remain read-only and truthful

The Result and History views SHALL continue to show translated prompt text only for non-English UI locales and non-empty validated translations. If translation is unavailable, the UI SHALL keep the original prompt and SHALL NOT display fabricated, malformed JSON, timeout internals, or a false success state.

#### Scenario: Translation unavailable in result
- WHEN composition succeeds but translation is null or degraded
- THEN the result remains usable, the original prompt remains available, and no malformed translation placeholder is shown
