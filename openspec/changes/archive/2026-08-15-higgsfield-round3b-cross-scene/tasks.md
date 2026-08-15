# Tasks — Higgsfield Round3 B cross-scene state package

## 1. Standalone engine

- [x] 1.1 Add bounded prev_final_frame and aligned final_frame validation (1000 characters).
  Evidence: video_prompt_engine/models.py; tests/test_cross_scene.py request-boundary cases.
- [x] 1.2 Add the V4 cache component and factual continuity instruction.
  Evidence: video_prompt_engine/optimizer.py, video_prompt_engine/prompt_builder.py; tests/test_cross_scene.py cache and injection cases.
- [x] 1.3 Implement advisory continuity checks and selection propagation.
  Evidence: video_prompt_engine/evaluator.py; tests/test_cross_scene.py English, Chinese, whitelist, no-context, and selection cases.

## 2. Desktop contract and pipeline

- [x] 2.1 Normalize and transport prev_final_frame; expose normalized final_frame and optional blocks.
  Evidence: apps/desktop/electron/services/video-prompt-engine-contract.js; apps/desktop/electron/services/video-prompt-engine-contract.test.js.
- [x] 2.2 Prefer 8020 with 8013 fallback provenance.
  Evidence: apps/desktop/electron/services/prompt-bridge.js; apps/desktop/electron/services/video-prompt-engine-contract.test.js.
- [x] 2.3 Serialize cross-scene optimization, preserve parallel media generation, and persist planned states.
  Evidence: apps/desktop/electron/services/story2video-stages.js; apps/desktop/electron/services/story2video-stages.test.js and apps/desktop/electron/services/story2video-manual-assets.test.js.
- [x] 2.4 Recover chains from checkpoint terminal state and report broken chains explicitly.
  Evidence: apps/desktop/electron/services/story2video-stages.js; resume-chain regression cases in apps/desktop/electron/services/story2video-stages.test.js.

## 3. Verification

- [x] 3.1 Run standalone focused and full Python regression suites.
  Evidence: pytest tests/ -q recorded in the delivery review.
- [x] 3.2 Run affected desktop contract and Story2Video suites.
  Evidence: targeted Vitest command recorded in the delivery review.
- [x] 3.3 Run strict OpenSpec validation before archive.
  Evidence: openspec validate higgsfield-round3b-cross-scene --strict recorded in the delivery review.
