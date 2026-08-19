## Purpose

This capability defines how a Story2Video History resume chooses models for unfinished work without regenerating successful local assets or adding a model-selection interaction.

## ADDED Requirements

### Requirement: Resume SHALL use current configured capability models for unfinished work

When a failed or interrupted orchestrator run is resumed, stale image, TTS and video provider/model routing from the launch snapshot SHALL NOT be treated as explicit routing for work that has no reusable local result. Text reasoning and prompt optimization SHALL continue to resolve the current default LLM at call time.

#### Scenario: Resume after Settings model change
- WHEN the user changes image, TTS, video or LLM settings after a run fails and clicks History Continue
- THEN completed local assets remain available, and each incomplete provider call resolves the current configured capability provider/model without a model picker

### Requirement: Completed local assets SHALL be reused by stable scene index

The resume path SHALL reuse a valid persisted image, audio or video path before calling a generation provider. It SHALL preserve video continuity metadata and SHALL NOT regenerate a successful asset only because its original model differs from the current model.

#### Scenario: Mixed old and current assets
- WHEN scene 1 has a valid old image/audio/video result and scene 2 is incomplete
- THEN scene 1 is reused unchanged, scene 2 is generated with current settings, and the final manifest may contain assets produced by both model versions

### Requirement: Resume SHALL preserve content parameters while replacing model routing

Resume model switching SHALL preserve prompts, scene indexes, supplied media, aspect ratio, voice ID, rate, pitch, emotion, video mode and selection ratios. It SHALL remove only stale provider/model routing fields and SHALL keep the run-state JSON contract backward compatible.

#### Scenario: Legacy snapshot without routing metadata
- WHEN an old version 1 snapshot has no current-model marker or capability model metadata
- THEN it remains readable, resume adds the internal policy in memory, and missing routing values fall back to current Settings without a migration failure

### Requirement: Voice incompatibility SHALL fail closed

When the current TTS provider/model does not support the requested voice ID or the existing voice catalog/model contract rejects the combination, the resume SHALL not silently substitute an unrelated voice or overwrite a previous audio asset. Existing provider error and re-clone handling SHALL remain the only fallback.

#### Scenario: Current model cannot use old clone voice
- WHEN a resumed incomplete TTS scene uses a voice ID unavailable to the current provider/model
- THEN the TTS call fails with the existing compatibility error or a successful persisted re-clone result, and no empty/incorrect audio is reported as success

### Requirement: Unknown remote task state SHALL NOT be misrepresented

The system SHALL document and preserve the limitation that current Story2Video snapshots do not persist remote video task IDs. Resume SHALL not mark an unknown remote submission as completed solely because the stage was interrupted. A future remote-task contract MUST bind status queries to the original provider/model before any switch.

#### Scenario: Interrupted remote submission under current persistence
- WHEN the process stops after a provider may have accepted a video submission but before a local video path is persisted
- THEN resume follows the existing stage-level retry/fallback behavior, does not fabricate a completed asset, and does not claim to query the unknown remote task

### Requirement: No additional model selection interaction SHALL be introduced

History Continue SHALL remain a single action. The current-model policy, reuse decisions and fail-closed errors SHALL be handled in the runtime and existing History/diagnostic surfaces; no new selector or confirmation state is required.

#### Scenario: Continue remains one-click
- WHEN the user opens a failed or interrupted Story2Video History item and activates Continue
- THEN the existing resume action starts recovery using current Settings or returns the existing actionable error without presenting model choices
