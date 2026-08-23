## Why

Higgsfield's long-form prompt corpus repeats the previous shot's end state because a video model has no cross-shot memory. Without that state, character position, wardrobe, injuries, lighting, and expression can reset between Story2Video scenes. This change implements the state hand-off as a bounded prompt-engine contract rather than leaving it to ad hoc caller text.

## What Changes

### Standalone video engine (prompt-engine repository)

- Add VideoOptimizeRequest.prev_final_frame and raise VideoPromptMeta.final_frame to the shared 1000-character boundary.
- Insert a factual, delimited SCENE-continuity reference only when the predecessor exists; directives inside the reference are not instructions.
- Include the previous-state hash in HIGGSFIELD_FMT_V4 cache keys.
- Score continuity as an advisory -5 signal: English entity match at 40 percent plus required character names; Chinese whitelist match at 60 percent or a 0.5 whole-string fallback ratio.

### Desktop contract and Story2Video (Multi-Publish repository)

- Normalize and sentence-truncate prev_final_frame at the desktop boundary; normalize returned final_frame and optional director blocks.
- Prefer the independent 8020 engine and tag responses with engine_source; retain legacy 8013 fallback for availability.
- Serialize only video-prompt optimization across video scenes, write each returned planned end-state back to the scene, and keep media generation parallel.
- Recover a resumed chain from terminal checkpoint state first. Missing or unsupported final-state output is an explicit degraded chain, not a fabricated video-frame observation.

## Capabilities

### New Capabilities
- higgsfield-cross-scene: bounded previous-state transport, continuity-aware selection, and checkpoint-safe Story2Video chaining.

### Modified Capabilities
<!-- None. -->

## Impact

- Runtime behavior changes in the independent video optimizer and Story2Video's video-prompt phase; no new UI surface is introduced.
- final_frame is prompt metadata describing the intended final image, not decoded output-video evidence.
- The V4 salt intentionally invalidates older video-prompt cache entries once for the combined Round3 B/C output format.
- A failed video prompt optimization continues to follow existing mixed-mode fallback behavior; a missing final state is visible through logs and continuity metadata rather than silently claiming continuity.
