# Requirements - Higgsfield Round3 B/C delivery

## Objective

Deliver the cross-scene state package and refined director-output package as a
single compatible Round3 format across the standalone 8020 video engine and
the Multi-Publish desktop contract.

## Required behavior

- Carry a bounded prev_final_frame / planned final_frame state through
  sequential Story2Video prompt optimization, checkpoint resume, and explicit
  chain-degradation reporting; media generation remains independently
  parallel.
- Prefer 8020 and retain 8013 fallback provenance without losing normalized
  state or block metadata.
- Support optional, bounded director blocks; preserve the legacy rendering
  path when they are absent.
- Report advisory continuity, rendered-block coverage, and negation-aware
  default gated checks without converting them into hard rejections.
- Use V4 cache isolation for the combined output-format change.

## Acceptance

- Both Round3 OpenSpec changes validate strictly.
- Prompt-engine and affected desktop test suites pass, followed by the
  Electron packaging/ASAR/launch gate required for main-process changes.
- The OpenSpec synchronization checker and its focused tests pass.
- Dual external reviews are attempted and their actual availability is
  recorded; Critical findings are resolved before remote merge.
- Both repository PRs merge before CCG/OpenSpec archive records are marked
  complete.
