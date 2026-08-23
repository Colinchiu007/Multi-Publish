# higgsfield-refined-output Specification

## Purpose
TBD - created by archiving change higgsfield-round3c-refined-output. Update Purpose after archive.
## Requirements
### Requirement: Structured refined director blocks
The standalone video engine SHALL accept and return an optional blocks object for refined video prompts. It MUST retain only the 12 approved director-block names, retain only non-empty string values of at most 4000 characters, render blocks in canonical order, and preserve legacy rendering when blocks are absent or invalid.

#### Scenario: Valid blocks produce a canonical director prompt
- **WHEN** refined video metadata contains approved non-empty blocks
- **THEN** the rendered prompt emits those blocks in canonical order with title markers and uses legacy metadata only to fill missing block content

#### Scenario: Invalid block material cannot alter output shape
- **WHEN** blocks contain unknown names, non-string values, empty values, or values longer than 4000 characters
- **THEN** unknown, non-string, and empty values are omitted and overlong values are bounded before rendering

#### Scenario: Existing callers without blocks remain compatible
- **WHEN** a response omits blocks or blocks normalizes to empty
- **THEN** the existing non-block rendering path remains in effect

### Requirement: Refined template self-audit and safe trailer handling
The refined strategy SHALL instruct the model to perform a FAIL CHECK before finalizing, including continuity, reference markers, timeline markers, exact trailer placement, and text-artifact constraints. This self-audit MUST be instruction-only and MUST NOT be rendered as a block. Trailer normalization MUST only remove a trailer-shaped final paragraph so director blocks containing similar words remain intact.

#### Scenario: FAIL CHECK improves generation guidance without polluting output
- **WHEN** a refined system prompt is built
- **THEN** it includes the FAIL CHECK instruction, while the rendered optimized prompt does not include the instruction as a visible director block

#### Scenario: A block-local phrase does not suppress the real trailer
- **WHEN** a non-final director block contains wording similar to a Photoreal NON-IP trailer
- **THEN** trailer normalization does not remove that block or prevent a valid final trailer from being appended

### Requirement: Block coverage is an advisory refined-only metric
The evaluator SHALL calculate block coverage from the engine's own normalized metadata and rendered prompt. The denominator MUST be the number of non-empty normalized blocks, the numerator MUST be canonical title markers found in the rendered output, and a ratio below 0.8 SHALL apply an advisory -5 violation.

#### Scenario: Fully rendered blocks receive full coverage
- **WHEN** every non-empty normalized block appears in the rendered prompt with its canonical title marker
- **THEN** checks report a block-coverage ratio of 1.0 and no block_coverage violation

#### Scenario: Missing rendered blocks are visible but not hard failures
- **WHEN** a refined prompt renders fewer than 80 percent of its non-empty normalized blocks
- **THEN** checks expose hit, total, and ratio and evaluation records block_coverage = -5 without rejecting the candidate

#### Scenario: Batch optimization does not use block coverage
- **WHEN** a prompt is evaluated in the batch tier or has no normalized blocks
- **THEN** block coverage is not applied and checks report it as unavailable

### Requirement: Negation-aware lock-gated rules
The evaluator SHALL apply lock-gated heuristic penalties only for rules listed in refined_blocks.json enabled_rules. A forbidden phrase MUST be ignored when all of its local occurrences are explicitly negated. The default enabled set MUST be dead_center, exposure_break, and eye_line; the remaining rule definitions stay available for controlled experiments.

#### Scenario: Enabled lock and non-negated forbidden content is penalized
- **WHEN** a refined prompt declares an enabled lock and later includes the corresponding forbidden content without a local negation
- **THEN** the evaluator records that rule as an advisory -5 violation

#### Scenario: A prohibition is not mistaken for a failure
- **WHEN** a refined prompt says no 3D render, not overexposed, no waxy skin, or an equivalent supported Chinese negation
- **THEN** that occurrence does not trigger the associated gated-rule violation

#### Scenario: Disabled rules stay inactive
- **WHEN** a rule exists in the corpus asset but is absent from enabled_rules
- **THEN** its lock and forbidden terms do not add a default evaluation penalty

### Requirement: Corpus-derived refined asset is reproducible
The project SHALL version the 12-block taxonomy, canonical detection pattern, coverage threshold, rule enablement, lock terms, and forbidden terms in refined_blocks.json. The corpus analysis script SHALL regenerate that asset without changing runtime behavior outside the reviewed asset update.

#### Scenario: Analyzer and runtime use the same title grammar
- **WHEN** corpus analysis, refined rendering, and evaluation identify director blocks
- **THEN** they use the same line-start title-and-colon grammar so coverage evidence cannot drift from the asset definition

#### Scenario: Output-format evolution invalidates stale video caches once
- **WHEN** the Round3 B/C output format is deployed
- **THEN** HIGGSFIELD_FMT_V4 partitions new cache entries from earlier formats without requiring per-request cache cleanup

