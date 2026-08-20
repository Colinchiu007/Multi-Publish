## Context

`PipelineEngine.resumeOrchestration` restores `params` and `context` from a failed/running snapshot. `resolveRuntimeStageOptions` then rebuilds stage options from those params. `generate_assets` additionally reads `context.video_plan.provider/model`, while local assets are reusable through `context.generate_assets.resume.completed`. The run-state JSON schema is version 1 and already persists JSON-safe context/params.

## Decision

Add an internal, non-user-visible resume marker to restored params: `__resumeUseCurrentModels: true`. The marker is not exposed through IPC and is removed from normal start input by existing normalization boundaries. During restore, a cloned parameter object removes only stale model-routing fields:

- image: `imageProvider`, `imageModel`;
- TTS: `voiceProvider`, `voiceModel`;
- video: `videoConfig.provider/model` and `stageOptions` video provider/model fields.

Content and media parameters remain unchanged, including `voiceId`, rate, pitch, emotion, video mode/ratios, prompts, scene indexes and supplied assets. The stage implementation also treats a snapshot `video_plan.provider/model` as non-authoritative when the marker is present, because `select_video_scenes` may already be completed and therefore will not be rerun.

The provider manager is then asked for the current default capability model at the actual asset call boundary. A configured explicit model is still used for a new task; a resumed task has no stale explicit model. Existing successful local paths are checked and returned before any provider call.

## Asset matrix

| Asset | Existing valid local result | Missing/failed result after resume | Compatibility/fallback |
|---|---|---|---|
| Text reasoning / prompt optimization | Existing context output is reused | Existing `generateWithDefault('llm')` / PromptBridge resolves current LLM | Provider failure keeps existing error contract |
| Image | `imagePath`/supplied asset is reused by scene index | Current image provider/model is resolved by the generator/manager | Missing provider follows existing failure path |
| TTS | `audioPath` is reused by scene index | Current TTS provider/model is passed; `voiceId` and speech parameters remain | Existing voice catalog/model checks and re-clone fallback; incompatible voice fails closed if provider rejects it |
| Video | Existing `videoPath` and continuity metadata are reused | Current video provider/model is resolved; old plan routing is ignored | Missing provider follows existing video failure/fallback-to-image behavior |

## Validation and compatibility

- Old snapshots without the marker or model metadata remain readable and are upgraded in memory on resume.
- The marker and cloned params must be JSON serializable; no Promise, secret, API key or binary data is persisted.
- Current provider/model values are taken from the configured manager and capability defaults, including multimodal `capability_models`.
- A successful local asset is never regenerated merely because its original model differs from the current model.
- Remote video task IDs are currently local variables inside `generateSceneVideo`; no reliable remote status can be queried after process interruption. The implementation does not claim to solve duplicate remote submission. A future change must persist `{ providerId, model, taskId, status }` before polling and query it with the original binding.

## Alternatives rejected

1. Add a model picker to the History page: rejected per product direction; it adds UI state and a second source of truth.
2. Reuse the old provider/model for all assets: rejected because it violates current Settings and makes recovery depend on deleted/disabled providers.
3. Blindly switch an in-flight remote video task to the new model: rejected because a new model cannot query the old task and may create duplicate billing/jobs. The current code lacks the persisted task ID needed for a safe implementation.
4. Regenerate all assets with current models: rejected because it wastes quota and breaks already successful scene continuity.

## Rollback

Reverting the runtime change restores the previous snapshot parameter behavior. Existing snapshots remain version 1 and readable because the marker is an additive in-memory field and no schema migration is required.
