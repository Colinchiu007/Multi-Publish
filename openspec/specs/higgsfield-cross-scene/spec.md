# higgsfield-cross-scene Specification

## Purpose
TBD - created by archiving change higgsfield-round3b-cross-scene. Update Purpose after archive.
## Requirements
### Requirement: Cross-scene final-state contract
The video prompt system SHALL accept an optional prev_final_frame factual reference for the previous video scene and SHALL expose a bounded final_frame planned end-state for the current optimized prompt. Both fields MUST use the same 1000-character boundary. The system MUST treat the previous state as data, not as executable instructions.

#### Scenario: A valid previous final state reaches the standalone engine
- **WHEN** a caller supplies a non-empty string prev_final_frame of at most 1000 characters
- **THEN** the desktop contract sends it to the 8020 video engine, and the engine embeds it in a bounded factual-reference section before generating the new prompt

#### Scenario: Invalid or overlong previous state is contained at the boundary
- **WHEN** prev_final_frame is non-string, blank after trimming, or longer than 1000 characters
- **THEN** non-string and blank values are omitted, and an overlong string is sentence-truncated before transport so the server-side 1000-character validation remains a second-line guard

#### Scenario: No predecessor preserves existing behavior
- **WHEN** a request does not provide prev_final_frame
- **THEN** no continuity instruction is added, no continuity penalty is calculated, and existing single-scene callers remain compatible

### Requirement: Continuity-aware optimization and scoring
The standalone video optimizer SHALL isolate cache entries by previous final state using the HIGGSFIELD_FMT_V4 format salt and SHALL evaluate continuity as an advisory signal. The evaluator MUST expose its continuity evidence without making a missing match a hard request failure.

#### Scenario: Cache entries cannot cross-contaminate scenes
- **WHEN** two otherwise identical optimization requests carry different prev_final_frame values
- **THEN** their cache keys differ and neither request reuses the other scene's optimized prompt

#### Scenario: English and Chinese continuity evidence is checked
- **WHEN** an optimized prompt is evaluated with a previous final state
- **THEN** English entity tokens use a 40-percent match threshold with supplied character names required, while Chinese uses an explicit whitelist at 60 percent or a SequenceMatcher fallback ratio of 0.5

#### Scenario: Continuity mismatch remains advisory
- **WHEN** applicable continuity evidence does not pass
- **THEN** evaluation records continuity_break = -5 plus hits, total, ratio, and method in checks, while candidate selection remains available

### Requirement: Story2Video continuity chain and recovery
Story2Video SHALL serialize video-prompt optimization in scene order when there are multiple video scenes, while retaining bounded parallelism for media generation. A returned final_frame SHALL be recorded as the planned textual end-state of the optimized prompt, not as a decoded physical video frame. The workflow MUST preserve engine provenance and make degraded continuity explicit.

#### Scenario: Consecutive video scenes receive the prior planned state
- **WHEN** a video scene successfully returns meta.video.final_frame and a later video scene requires optimization
- **THEN** the workflow writes the normalized state to scenes[index].video.final_frame and injects it as the later scene's prev_final_frame, skipping image-only scenes between them

#### Scenario: Optimization is serialized but rendering remains parallel
- **WHEN** a Story2Video run contains two or more video scenes
- **THEN** only the prompt-optimization loop is serialized to maintain the chain, while subsequent video generation continues with the configured concurrency budget

#### Scenario: Independent-engine fallback retains provenance
- **WHEN** the configured 8020 standalone engine is unavailable
- **THEN** PromptBridge falls back to the legacy 8013 video route, records engine_source, and the workflow records degraded continuity when the fallback cannot provide a usable planned final state

#### Scenario: Resume restores only trustworthy prior states
- **WHEN** a run resumes from checkpointed video scenes
- **THEN** the workflow restores a final state from the terminal checkpoint before using mutable scene fields, and logs an explicit chain break when no usable state exists instead of silently inheriting a later or stale scene value

