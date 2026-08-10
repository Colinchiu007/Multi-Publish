---
description: "Quality checklist with UI/UX completeness gates and TDD coverage verification"
---

# /speckit.checklist — Quality Rhythm Enhanced

You are a quality analyst generating a comprehensive checklist for the feature specification.
This checklist acts as "unit tests for your English" — every item must pass before the spec is considered complete.

## Standard Spec Kit Checklist Items

- [ ] All user stories have acceptance scenarios in Given/When/Then format
- [ ] All functional requirements are testable (no vague language like "should be fast")
- [ ] All edge cases are identified for each user story
- [ ] Assumptions are tagged with 🔶 and validated or escalated to 🔵 Open Questions
- [ ] Success criteria are measurable with baselines and targets
- [ ] Dependencies are mapped with owners and timelines

## UI/UX Completeness Checklist

### Field Specifications

- [ ] Every form page has a complete field specification table
- [ ] Every field has: name, type, label, placeholder, default, validation, error message, required flag
- [ ] Conditional fields have show/hide conditions documented
- [ ] File upload fields specify: accepted types, max size, max count
- [ ] Number fields specify: min, max, step, precision
- [ ] Text fields specify: max length, pattern (if any)
- [ ] Select/multiselect fields specify: options source (static list vs API), max selected count
- [ ] Form submission rules are defined: success action, failure action, loading state

### Interaction Controls

- [ ] Every interactive element has: trigger, action, state change, disabled condition
- [ ] Loading states are defined for async operations (button spinner, page skeleton)
- [ ] Keyboard shortcuts are documented (if applicable)
- [ ] Drag-and-drop interactions specify: drop zones, validation, visual feedback

### Modal/Dialog/Toast

- [ ] Every modal has: trigger, title, content, buttons (label + action + style), close method
- [ ] Every destructive action has a confirmation dialog with specific warning text
- [ ] Toast notifications specify: type, message, duration, position, action link
- [ ] Drawer/side panels specify: position, width, content, close method

### Error/Empty/Loading States

- [ ] Every screen has error state specification
- [ ] Every screen has empty state specification (what to show when no data)
- [ ] Every screen has loading state specification
- [ ] Error messages are user-friendly (not technical jargon)
- [ ] Recovery actions are available for each error type

### Visual Specification

- [ ] Component library is identified
- [ ] Design tokens are referenced (or custom colors/fonts defined)
- [ ] Responsive breakpoints are specified
- [ ] Accessibility requirements are listed (WCAG level)

### Field Validation

- [ ] Frontend validation rules defined for every field (trigger event + rule)
- [ ] Backend validation rules defined for every field (HTTP status + error response format)
- [ ] Cross-field validation rules defined (if any fields depend on each other)
- [ ] Async validation rules defined (if any fields need server-side checks)

## TDD Coverage Checklist

- [ ] Every P1 acceptance criterion maps to at least one test scenario
- [ ] Every P2 acceptance criterion maps to at least one test scenario
- [ ] Test scenarios use Gherkin format (Given/When/Then)
- [ ] Test types are specified (E2E, Integration, Unit)
- [ ] Visual regression test scenarios are defined for new/changed components
- [ ] API contract test scenarios are defined for new/changed endpoints
- [ ] Data validation test scenarios cover invalid inputs
- [ ] Test priority matches user story priority

## Quality Gate Checklist

Before moving from Phase 0 (探索期) to Phase 1 (规划期):

- [ ] Phase 0 Gate in spec.md: all items checked
- [ ] Open Questions count < 3
- [ ] No CRITICAL GAPs remaining from clarification
- [ ] At least one test scenario per P1 acceptance criterion

Before moving from Phase 1 (规划期) to Phase 2 (开发期):

- [ ] TDD scenario coverage >= 80% for P1 stories
- [ ] All test scenarios have assigned test types
- [ ] Test infrastructure is defined (framework, runner, environment)
- [ ] Visual regression baselines are planned

## Output Format

```
## Quality Checklist Report

**Spec**: [feature name]
**Date**: [date]
**Total Items**: [count]
**Passed**: [count] ✅
**Failed**: [count] ❌
**Not Applicable**: [count] ⬜

### Failed Items (must fix before proceeding)
1. [item description] — [why it matters]
2. [item description] — [why it matters]

### Warnings (should fix, won't block)
1. [item description] — [recommendation]

### Score
[PASS / FAIL] — [X/Y critical items passed]
```
