## Purpose

为视频创作的各类流水线提供可验证、可管理且设备级隔离的具名选项组合，让用户能够在不重新填写表单的情况下复用配置，同时避免素材、凭证、运行态或跨流水线数据泄漏。

## ADDED Requirements

### Requirement: All video creation pipelines expose managed configuration profiles

The video creation module SHALL expose save and management entry points for every pipeline that can be opened in the creation form, including the shared CreateView orchestrated and legacy branches and the dedicated video-clone and film-engineering pages.

#### Scenario: Dedicated pipeline pages expose profile controls

- **WHEN** the user opens the video-clone or film-engineering page
- **THEN** the page displays save and manage controls bound to its own stable pipeline ID and preserves the page's existing start, retry, library, and generation actions

#### Scenario: Shared creation form exposes profile controls

- **WHEN** a selected pipeline is rendered in CreateView
- **THEN** the save and manage controls are available for that selected pipeline and are not rendered without a selected pipeline

### Requirement: Profiles persist as validated device-local records

The application SHALL persist profiles in the current Electron user's local data directory at userData/story2video-config-profiles/config-profiles.json. Each record SHALL contain only id, name, pipelineId, snapshot, createdAt, and updatedAt. Names SHALL be trimmed and measured by Unicode code point with a limit of 1 through 60; pipeline IDs SHALL match [A-Za-z0-9][A-Za-z0-9._-]* and be 1 through 64 characters; profile IDs SHALL match [A-Za-z0-9-]{8,64}; snapshots SHALL be plain JSON objects no larger than 64 KiB when UTF-8 serialized; and each pipeline SHALL have at most 50 profiles.

#### Scenario: Invalid input is rejected without a write

- **WHEN** a create or rename request contains an invalid name, pipeline ID, profile ID, snapshot, snapshot size, or capacity state
- **THEN** the request returns a structured validation error and the existing index bytes remain unchanged

#### Scenario: Device-local storage does not imply synchronization

- **WHEN** a profile is created on one device or user-data directory
- **THEN** it is available only in that local store and the feature does not claim account sync, cross-device sync, or cloud backup

### Requirement: Profile storage remains recoverable and fail-closed

Profile writes SHALL use a temporary file followed by an atomic replacement and bounded handling for Windows file-occupancy errors. An unreadable or unparsable index SHALL be treated as an empty readable store that can be rebuilt; a parseable index containing one or more invalid entries SHALL expose valid entries for reading but SHALL reject every write until the original file is manually repaired, without overwriting its bytes.

#### Scenario: Corrupt JSON can be rebuilt

- **WHEN** the index cannot be parsed as JSON
- **THEN** listing safely returns an empty collection and a subsequent valid create can write a fresh index

#### Scenario: Partially invalid index is protected

- **WHEN** the index is parseable but includes an invalid profile entry
- **THEN** listing returns only valid entries, every create/rename/delete operation fails closed, and the original index bytes are preserved

### Requirement: CRUD and duplicate-name behavior are explicit

The application SHALL support list, create, rename, and delete operations through trusted IPC. Names SHALL be unique within a pipeline; create without explicit overwrite SHALL reject a duplicate, while explicit overwrite SHALL replace the matching snapshot and update updatedAt without creating a second record. List results SHALL be ordered newest first for display.

#### Scenario: Same-pipeline duplicate uses two-step overwrite

- **WHEN** the user first saves a name already present in the same pipeline and has not confirmed overwrite
- **THEN** the UI enters overwrite state without writing, and the next explicit save sends overwrite=true

#### Scenario: Rename and delete update the manager

- **WHEN** the user confirms a rename or delete action
- **THEN** the corresponding record is updated or removed, the manager updates its list, and a localized success notification is shown

### Requirement: Snapshots use pipeline-specific allowlists

The shared CreateView SHALL capture only configured form choices: orchestrated snapshots include the explicit s2vConfig and s2vOutputConfig allowlists plus validated UI expansion state; legacy snapshots include input mode, style, LLM, budget, checkpoint, storyboard, and output choices. Video-clone snapshots SHALL include only sourceType, mode, and rewriteScript. Film-engineering snapshots SHALL include only copyMode, normalized character mappings, and llmEnabled. No snapshot SHALL include local media paths, uploaded files, credentials, URLs containing source material, run IDs, reports, similarity results, generated assets, publish fields, or other runtime state.

#### Scenario: Dedicated snapshots exclude source and runtime state

- **WHEN** a video-clone or film-engineering profile is saved after a run or after local media has been selected
- **THEN** the persisted snapshot contains only its allowlisted choices and cannot restore the source path, report, generated result, or run state

#### Scenario: Legacy and orchestrated snapshots are distinguishable

- **WHEN** the user saves a profile from either CreateView branch
- **THEN** the snapshot contains schemaVersion=1, an ISO capture timestamp, and exactly the corresponding legacy or orchestrated shape

### Requirement: Applying a profile is scoped, confirmed, and normalized

The application SHALL apply only a profile whose pipeline ID matches the current target. A dirty form SHALL require confirmation before replacement. Application SHALL validate snapshot shape, perform type-aware copying, normalize stale enumerations and numeric values, normalize resolution against the current capability limit, and clear or safely fall back unavailable providers. It SHALL suppress the story2video.lastOptions.v1 watcher during application and protect against late provider-refresh or pipeline-switch responses. Video-clone application SHALL never overwrite the current link or local file path; film-engineering application SHALL update both the role-entry editor and its adaptation character map.

#### Scenario: Foreign profile is visible but cannot apply

- **WHEN** the manager lists a valid profile belonging to another pipeline
- **THEN** the profile remains visible with its pipeline label, but its apply control is disabled and no current form field is changed

#### Scenario: Dirty form requires confirmation

- **WHEN** the current form differs from its defaults and the user chooses a matching profile
- **THEN** a confirmation dialog appears; cancelling leaves the form unchanged, while confirming applies the captured profile

#### Scenario: A pipeline switch during confirmation is rejected

- **WHEN** the user opens the apply confirmation and switches to another pipeline before confirming
- **THEN** the application rejects the stale target, leaves the new pipeline's form unchanged, and shows the localized foreign-pipeline explanation

#### Scenario: Invalid provider and stale enum values are safe

- **WHEN** a profile contains a provider that is no longer available or an enum/value outside the current allowlist
- **THEN** the provider is cleared or falls back to the first valid option and the enum/value is normalized to a valid default without an empty invalid selection

### Requirement: Management interaction is localized and race-safe

The manager SHALL show name, pipeline label, updated time, empty/loading/error states, and localized controls for save, apply, rename, delete, confirm, cancel, and close. The dialogs SHALL be closable while list or save requests are pending; closing increments a request generation so late results cannot reopen a dialog or overwrite current state. Nonzero IPC envelopes and thrown errors SHALL be treated as failures, shown through safe user-facing mapping, and shall not leak paths, stacks, credentials, or internal object details.

#### Scenario: Closing while loading ignores the late response

- **WHEN** the user closes the list while its request is pending and the request later resolves
- **THEN** the list remains closed and the late result is discarded

#### Scenario: Error envelope is not treated as success

- **WHEN** an IPC operation returns a nonzero code envelope
- **THEN** the manager keeps the relevant dialog state, displays a localized/user-readable error, and does not mutate the profile list as if the operation succeeded

#### Scenario: Both supported locales contain the same product terms

- **WHEN** a new profile control or status is rendered in Chinese or English
- **THEN** the corresponding zh/en locale keys exist as a pair and no newly introduced renderer hard-coded Chinese string is required
