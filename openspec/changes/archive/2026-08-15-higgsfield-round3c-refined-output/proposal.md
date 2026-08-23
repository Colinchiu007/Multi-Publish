## Why

Higgsfield's long-form corpus does not treat a refined prompt as an unordered
field dump. It uses a director-facing shot sheet: scene intent, spatial
layout, lighting, colour, camera, continuity, character performance, and an
intended final image are explicit and inspectable. The engine needed that
shape without turning prompt evaluation into a brittle hard gate.

The delivery therefore adds a bounded, optional director-block representation
to the refined tier. It also makes the highest-value corpus guardrails
measurable: rendered-block coverage and a small, negation-aware set of
lock-gated advisory checks.

## What Changes

### Corpus asset and analysis (prompt-engine repository)

- Add scripts/analyze_hg_corpus.py, a read-only corpus analyzer that
  distinguishes director and inline prompt families, measures block and tier
  occurrence, and records positive versus negated lock/forbidden terms.
- Version the resulting 12-block taxonomy, canonical title grammar,
  coverage.min_ratio = 0.8, rule definitions, and default enablement in
  video_prompt_engine/knowledge/refined_blocks.json.

### Standalone video engine (prompt-engine repository)

- Add optional VideoPromptMeta.blocks: only the 12 canonical names are
  retained; only non-empty strings survive; every value is bounded to 4000
  characters.
- In the refined tier, render available blocks in canonical order and use
  legacy metadata only to fill a missing block. Requests without valid blocks
  keep the existing renderer.
- Put FAIL CHECK in the model instruction only. It guides self-audit but is
  stripped if accidentally emitted and never becomes a director block.
- Normalize the trailer only from a trailer-shaped final paragraph so a
  block-local phrase such as Photoreal NON-IP aesthetic cannot remove a later
  FINAL FRAME block or suppress the real trailer.
- Score block coverage from normalized non-empty blocks to their rendered
  canonical title markers. A ratio below 0.8 records the advisory
  block_coverage = -5 signal; it does not reject a candidate.
- Keep seven corpus-rule definitions available, but enable only dead_center,
  exposure_break, and eye_line by default. A rule needs an active non-negated
  lock and a non-negated forbidden occurrence; local prohibitions such as not
  overexposed and no waxy skin are not failures.
- Partition the combined Round3 B/C output format under the V4 cache salt.

### Desktop contract (Multi-Publish repository)

- Normalize and expose the optional director blocks at the 8020/8013 boundary
  with the same 12-key whitelist and 4000-character value bound.
- Keep the addition backward compatible: callers and legacy 8013 responses
  without blocks retain their existing output path.

## Capabilities

### New Capabilities

- higgsfield-refined-output: optional director-block output, safe trailer
  handling, advisory coverage evidence, and negation-aware lock-gated
  diagnostics for refined video prompts.

### Modified Capabilities

<!-- None. -->

## Impact

- Runtime behavior changes only for the standalone refined video path and its
  additive desktop response normalization.
- Block coverage and gated-rule findings are visible quality signals, not
  hard acceptance criteria.
- HIGGSFIELD_FMT_V4 intentionally separates new B/C cache entries from prior
  output formats once; no per-request cache cleanup is required.
- The corpus analyzer and asset are reproducible inputs to the runtime schema,
  not a claim that a generated video has been visually decoded.
