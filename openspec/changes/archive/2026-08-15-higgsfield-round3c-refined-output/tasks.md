# Tasks - Higgsfield Round3 C refined director output

## 1. Corpus asset and schema

- [x] 1.1 Add a read-only corpus analyzer with director/inline family
  statistics, canonical block detection, and positive-versus-negated rule
  evidence.
  Evidence: scripts/analyze_hg_corpus.py; tests/test_analyze_hg_corpus.py.
- [x] 1.2 Version the 12-block taxonomy, title grammar, 0.8 coverage ratio,
  rule definitions, and three-rule default enablement.
  Evidence: video_prompt_engine/knowledge/refined_blocks.json;
  tests/test_refined_blocks.py asset-contract cases.

## 2. Standalone refined engine

- [x] 2.1 Validate and normalize optional director blocks (12 approved keys,
  non-empty strings only, 4000 characters per value).
  Evidence: video_prompt_engine/models.py;
  video_prompt_engine/refined_blocks.py; tests/test_refined_blocks.py.
- [x] 2.2 Add refined-template block instructions, instruction-only FAIL CHECK,
  and preventive skin/eye-line guidance.
  Evidence: video_prompt_engine/strategies/base.py;
  tests/test_refined_blocks.py template and rendering cases.
- [x] 2.3 Render canonical block order with legacy-field fallback and preserve
  only a real final trailer paragraph during normalization.
  Evidence: video_prompt_engine/strategies/base.py;
  video_prompt_engine/optimizer.py; tests/test_refined_blocks.py trailer and
  fallback cases.
- [x] 2.4 Add refined-only block coverage and negation-aware gated diagnostics.
  Evidence: video_prompt_engine/evaluator.py; tests/test_refined_blocks.py
  coverage, enablement, and negation cases.
- [x] 2.5 Partition the combined Round3 B/C format under the V4 cache salt.
  Evidence: video_prompt_engine/optimizer.py;
  tests/test_refined_blocks.py TestSaltV4.

## 3. Desktop contract and verification

- [x] 3.1 Normalize and return blocks at the Multi-Publish video contract
  boundary without changing responses that omit blocks.
  Evidence: apps/desktop/electron/services/video-prompt-engine-contract.js;
  apps/desktop/electron/services/video-prompt-engine-contract.test.js.
- [x] 3.2 Run focused and full standalone/desktop regression suites and strict
  OpenSpec validation before archive.
  Evidence: delivery CCG review records and .quality-gates.md (fresh execution
  is recorded before PR merge).
