## Context

The current Story2Video flow stores prompt translations in context.prompt_translations during the custom story2video_optimize executor. Automatic generate_assets then copies those values into scene manifests, the generic compose executor passes them through by scene index, and saveRun persists compose segments. Manual material selection consumes the same values before its user checkpoint.

The change must preserve the generic compose behavior used by other pipelines, the existing progress callback contract, the manual checkpoint UX, and JSON-only run checkpoints.

## Goals / Non-Goals

**Goals:**

- Hide optional automatic translation latency behind the existing long-running ffmpeg compose stage.
- Keep composition inputs and success/failure semantics independent from translation.
- Make translation time bounded, fail-open, index-aligned, resumable, and observable in run context.
- Keep manual candidate translation and existing Result/History display contracts unchanged.

**Non-Goals:**

- Do not change prompt-engine optimization, image/TTS/video generation, subtitle content, or publishing semantics.
- Do not merge the separate archived codex/s2v-translation-optimize branch wholesale.
- Do not add a new provider, translation language picker, or a user-facing retry control in this change.

## Decisions

### 1. Use a registered compose parallel-task hook

The generic StageExecutor keeps its existing compose implementation and accepts an optional registered task factory for stages that explicitly opt in. The Story2Video stage registration supplies the prompt translation task only for the Story2Video compose stage. This avoids duplicating ffmpeg option whitelists and progress normalization, and prevents other pipelines from accidentally starting translation.

Alternative rejected: copy the entire generic compose executor into story2video-stages.js; this would drift on progress, TTS samples, option validation, and error handling.

### 2. Store a serializable pending payload, not a Promise

The optimize executor writes { uiLocale, items: [{ index, prompt }] } into context.prompt_translations_pending for automatic mode. The in-memory Promise exists only during the active compose call. Completed results are written back to context.prompt_translations; pending state is removed only after finalization. This makes restart/resume deterministic and avoids attempting to JSON serialize a Promise.

### 3. Run with Promise.all and a bounded finalization grace

The hook starts translation and composeVideo together. The compose result remains authoritative. After composition resolves, the hook waits only for the configured translation grace/deadline, then applies valid translations by index. This hides normal translation latency while preventing a slow provider from extending the pipeline indefinitely.

### 4. Preserve manual-mode timing

Manual material candidate scenes are displayed before compose, so their translation remains in optimize and is copied into candidates/finalize assets as before. Automatic mode is the only mode that receives deferred scheduling.

### 5. Keep translation fail-open and diagnostic-only

Translation errors, invalid JSON, empty strings, per-batch timeouts, and missing LLM providers produce null entries and a structured context diagnostic. They never turn a successful compose into a failed video. The diagnostic is for logs, run snapshots, and future UI messaging; this change does not introduce a new warning card.

### 6. Validate at every boundary

Pending locale, scene indexes, prompt strings, translation strings, timeout values, and compose output segments are normalized before use. Translation values are capped by the existing 2,000-character contract and rejected when they equal the source prompt or contain JSON-wrapper artifacts.

## Risks / Trade-offs

- [Translation task continues briefly after compose failure] -> Attach a bounded task catch/finalizer and discard its result when compose fails; never leave an unhandled rejection.
- [Short videos finish before translation] -> Apply a finite grace budget and keep null values fail-open; the video remains available.
- [Provider rate limits across batch runs] -> Reuse the existing model-call path and bounded per-job concurrency; document that translation is optional and governed by provider limits.
- [Resume repeats an in-flight request] -> Persist only the payload and completed result; restarting an in-flight job is intentional and idempotent for this read-only augmentation.
- [Manual checkpoint regression] -> Keep manual mode on the old pre-checkpoint path and add a regression assertion for candidate translations.

## Migration Plan

1. Deploy runtime and test changes together; existing runs without a pending payload continue to use their persisted translations or no translation.
2. New automatic runs use the deferred contract; English UI runs remain unchanged.
3. If a rollback is needed, revert the runtime commit. Existing project segment promptTranslation fields remain compatible because the persisted shape is unchanged.
4. Validate focused tests, desktop build, and the required Windows package/ASAR checks before merge.

## Open Questions

None. The user-facing degraded translation indicator remains diagnostic-only in this change; adding a visible notification can be a follow-up once product copy is approved.
