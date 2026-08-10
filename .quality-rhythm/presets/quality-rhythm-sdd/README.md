# Quality Rhythm SDD Preset

Spec-Driven Development preset with comprehensive UI/UX specification gates and TDD test mapping.

## What This Preset Provides

This preset enhances Spec Kit's core workflow with **execution-layer specifications** that the standard templates don't cover:

| Enhancement | What It Adds |
|------------|-------------|
| **UI Field Specifications** | Every form field: type, validation, error messages, show/hide conditions |
| **Interaction Control Specs** | Every button, dropdown, switch: trigger, action, state change, disabled condition |
| **Modal/Dialog/Toast Specs** | Every popup: trigger, content, buttons, close method, overlay behavior |
| **Visual Specifications** | Component library, colors, typography, spacing, responsive breakpoints, WCAG |
| **Error/Empty/Loading States** | Every screen's three states: error display + recovery, empty CTA, loading indicator |
| **Field Validation Rules** | Frontend real-time + backend on-save + cross-field + async validation |
| **TDD Test Mapping** | Every acceptance criterion → test scenario (Gherkin format, with test type) |
| **Quality Rhythm Gates** | Phase 0→1→2→3→4 mandatory checklists at each transition |

## Installation

```bash
# From quality-rhythm repository
cd <path-to-quality-rhythm>
specify preset add --dev presets/quality-rhythm-sdd

# Verify installation
specify preset resolve spec-template  # should resolve to quality-rhythm-sdd
specify preset info quality-rhythm-sdd
```

## When to Use

- **Frontend features** with forms, modals, interactive elements
- **Full-stack features** requiring field validation across frontend/backend
- **UI-heavy projects** where visual regression testing matters
- **TDD-mandatory projects** where specs must map to test scenarios
- **Chinese-language teams** needing bilingual spec templates

## Workflow

```
1. /speckit.constitution  → Set project principles (incl. quality-rhythm gates)
2. /speckit.specify       → Create spec with enhanced UI/UX/TDD sections
3. /speckit.clarify       → Probe UI fields, interactions, modals, error states
4. /speckit.checklist     → Verify completeness (UI + TDD coverage)
5. /speckit.analyze       → Cross-check consistency
6. /speckit.plan          → Generate plan with TDD-first task ordering
7. /speckit.tasks         → Generate executable task list
8. /speckit.implement     → Build with TDD (test-first)
```

## Template Overrides

| Template | What Changed |
|---------|-------------|
| `spec-template` | Added 7 new mandatory sections: UI Fields, Interaction Controls, Modals/Toasts, Visual Specs, Error/Empty/Loading, Field Validation, TDD Mapping. Added Quality Rhythm Gate checklist. |
| `plan-template` | Added Quality Rhythm Integration table, Test-First Development Plan, Visual Regression Plan, TDD task ordering. |
| `speckit.clarify` | Enhanced to probe UI completeness, interaction controls, modals, error states, visual specs, field validation. |
| `speckit.checklist` | Added UI/UX completeness checklist, TDD coverage checklist, Phase gate checklists. |

## Example: Spec Sections This Preset Adds

### UI Field Specification Table
| Field Name | Type | Label | Validation | Error Message | Required |
|-----------|------|-------|-----------|---------------|----------|
| email | email | 邮箱 | regex + async | 格式错误 / 已注册 | Yes |
| age | number | 年龄 | range: 0-150 | 请输入有效年龄 | No |

### TDD Test Scenario Table
| Scenario | Given | When | Then | Test Type | Spec Ref |
|---------|-------|------|------|-----------|----------|
| TS-1.1 | 用户未登录 | 点击"提交" | 弹出登录确认框 | E2E | US-1-AC-3 |

## Composition

This preset uses `replace` strategy for all overrides. It fully replaces the core templates with enhanced versions.

**Stacking with other presets:** Place this preset at higher priority than core but lower than project-local overrides.

## License

MIT
