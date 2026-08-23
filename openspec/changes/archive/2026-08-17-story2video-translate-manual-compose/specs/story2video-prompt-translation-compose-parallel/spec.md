## Purpose

Extend deferred prompt translation to manual Story2Video material selection without blocking candidate generation or selection.

## ADDED Requirements

### Requirement: Manual optimize SHALL defer display-only translation

For a non-English UI locale in manual material-selection mode, optimize SHALL finish prompt optimization and record a JSON-serializable pending translation payload without awaiting the translation LLM. Candidate asset generation and the scene-asset-selection checkpoint SHALL remain runnable when translations are absent.

#### Scenario: Manual optimize does not wait for translation
- WHEN manual mode uses a non-English locale and optimize returns valid optimized prompts
- THEN optimize writes `prompt_translations_pending`, does not call the translation LLM, and returns successfully

#### Scenario: Manual candidate checkpoint tolerates missing translation
- WHEN manual candidate generation completes before deferred translation
- THEN each candidate may contain `promptTranslation: null`, while candidate IDs, media paths, scene indexes, and selection checkpoint data remain available

### Requirement: Manual compose SHALL overlap translation with video composition

After manual selections are finalized, the compose stage SHALL start the bounded translation task and `composeVideo` without serially waiting for one before starting the other. The translation task SHALL only update `promptTranslation` fields and SHALL NOT replace candidates, selections, media paths, prompts, audio, or composition inputs.

#### Scenario: Manual compose and translation overlap
- WHEN a manual run has a valid pending payload and confirmed scene selections
- THEN compose and translation are both started before either final result is awaited

#### Scenario: Manual translation applies by scene index
- WHEN translation responses complete out of order
- THEN the final manual scenes and compose segments receive translations by matching stable scene index

### Requirement: Manual deferred translation SHALL fail open

Translation failure, timeout, malformed response, empty response, invalid index, or prompt mismatch SHALL not fail candidate selection or a successful compose. Existing valid translations SHALL be preserved, and incomplete items SHALL remain null with a diagnostic.

#### Scenario: Manual translation timeout does not block video
- WHEN manual compose succeeds but translation exceeds its bounded budget
- THEN the video result remains successful, uncompleted translations remain null, and the run records translation degradation

### Requirement: Manual selection state SHALL remain independent

Deferred translation SHALL preserve the manual candidate manifest and selection contract. Candidate confirmation SHALL continue to use scene `index` and `candidateId`, and translation application SHALL not rebuild or reorder candidate arrays.

#### Scenario: Translation application preserves selected assets
- WHEN a manual run applies translations after `finalize_assets` has selected candidates
- THEN `candidates`, `selection`, selected media paths, audio paths, and scene indexes remain unchanged except for `promptTranslation`
