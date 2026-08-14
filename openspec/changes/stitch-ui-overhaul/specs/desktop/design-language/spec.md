# Design Language Specification

## Purpose

Defines the visual design language contract for Multi-Publish desktop app - tokens, component visual defaults, layout principles, state conventions, and dark mode mapping. This is the single source of truth for all UI implementation work under the stitch-ui-overhaul change.

## Token Contract

### Color Tokens

| Token | Purpose | Value |
|-------|---------|-------|
| --apple-surface-primary | Primary surface (cards, panels) | #FFFFFF |
| --apple-surface-secondary | Secondary surface (sidebar, nav) | #F5F5F7 |
| --apple-surface-tertiary | Tertiary surface (code, muted) | #E8E8ED |
| --apple-ink-primary | Primary text | #1D1D1F |
| --apple-ink-secondary | Secondary/muted text | #6E6E73 |
| --apple-ink-tertiary | Placeholder, disabled text | #AEAEB2 |
| --apple-accent | Primary action (buttons, links) | #007AFF |
| --apple-accent-hover | Accent hover state | #0056CC |
| --apple-success | Success state | #34C759 |
| --apple-warning | Warning state | #FF9500 |
| --apple-error | Error/danger state | #FF3B30 |
| --apple-border | Default border | #D2D2D7 |
| --apple-border-subtle | Subtle/hairline border | #E5E5EA |
| --apple-shadow-sm | Small elevation | 0 1px 2px rgba(0,0,0,0.04) |
| --apple-shadow-md | Medium elevation | 0 2px 8px rgba(0,0,0,0.08) |
| --apple-shadow-lg | Large elevation | 0 8px 24px rgba(0,0,0,0.12) |

### Typography Tokens

| Token | Value |
|-------|-------|
| --apple-font-display | SF Pro Display, Inter, PingFang SC, system-ui, sans-serif |
| --apple-font-text | SF Pro Text, Inter, PingFang SC, system-ui, sans-serif |
| --apple-font-mono | SF Mono, JetBrains Mono, Consolas, monospace |
| --apple-size-xs | 11px |
| --apple-size-sm | 13px |
| --apple-size-base | 15px |
| --apple-size-md | 17px |
| --apple-size-lg | 20px |
| --apple-size-xl | 24px |
| --apple-size-xxl | 28px |
| --apple-weight-regular | 400 |
| --apple-weight-medium | 500 |
| --apple-weight-semibold | 600 |
| --apple-weight-bold | 700 |
| --apple-leading-tight | 1.2 |
| --apple-leading-normal | 1.5 |
| --apple-leading-relaxed | 1.625 |

### Spacing and Density

| Token | Value | Use |
|-------|-------|-----|
| --apple-space-1 | 4px | Tight insets, icon gaps |
| --apple-space-2 | 8px | Compact inline gaps |
| --apple-space-3 | 12px | Default component padding |
| --apple-space-4 | 16px | Standard spacing |
| --apple-space-5 | 20px | Section inner padding |
| --apple-space-6 | 24px | Card/panel padding |
| --apple-space-8 | 32px | Section gaps |
| --apple-space-10 | 40px | Large section gaps |
| --apple-space-12 | 48px | Page-level spacing |
| --apple-space-16 | 64px | Hero/feature spacing |

### Border Radius

| Token | Value | Use |
|-------|-------|-----|
| --apple-radius-sm | 6px | Buttons, inputs, small elements |
| --apple-radius-md | 10px | Cards, panels |
| --apple-radius-lg | 14px | Modals, large containers |
| --apple-radius-xl | 18px | Feature cards |
| --apple-radius-pill | 9999px | Badges, tags, avatars |

### Motion

| Token | Value |
|-------|-------|
| --apple-duration-fast | 120ms |
| --apple-duration-normal | 200ms |
| --apple-duration-slow | 320ms |
| --apple-ease-default | cubic-bezier(0.25, 0.1, 0.25, 1) |
| --apple-ease-spring | cubic-bezier(0.34, 1.56, 0.64, 1) |
| --apple-ease-in-out | cubic-bezier(0.4, 0, 0.2, 1) |

## Component Visual Defaults

### UiButton

- primary: var(--apple-accent) fill, white text, var(--apple-radius-sm) radius, var(--apple-space-3) var(--apple-space-5) padding
- secondary: transparent fill, var(--apple-accent) text + border, same radius/padding
- ghost: transparent, no border, var(--apple-ink-secondary) text, hover var(--apple-surface-tertiary) bg
- danger: var(--apple-error) fill, white text (reserved for destructive actions only)

### UiInput

- Border: 1px solid var(--apple-border), radius var(--apple-radius-sm)
- Focus: 2px solid var(--apple-accent) ring, no heavy shadow
- Placeholder: var(--apple-ink-tertiary)

### UiCard

- Background: var(--apple-surface-primary), border 1px solid var(--apple-border-subtle)
- Radius: var(--apple-radius-md), shadow: none (border-based definition)
- Hover: subtle var(--apple-shadow-sm) elevation lift

### UiBadge

- Small, pill-shaped, var(--apple-radius-pill)
- Background: semantic color at 10% opacity, text at full opacity

### UiModal

- Overlay: rgba(0,0,0,0.3) with var(--apple-duration-normal) fade-in
- Content: var(--apple-radius-lg), var(--apple-shadow-lg)
- Title: var(--apple-size-lg), var(--apple-weight-semibold)

## Layout Principles

### Desktop App Layout

1. Sidebar: 240px fixed width, var(--apple-surface-secondary) background
2. Module Nav: Horizontal tab bar below navbar, var(--apple-surface-primary) background
3. Content Area: Full remaining width, var(--apple-surface-primary) background
4. Max Content Width: 1200px for content-heavy pages, centered with auto margins

### Information Density Rules

- High density (lists, tables): Row height 40px min, compact padding var(--apple-space-2) / var(--apple-space-3)
- Medium density (forms, cards): Row height 48px, standard padding var(--apple-space-3) / var(--apple-space-4)
- Low density (dashboards, overview): Generous padding var(--apple-space-6), section spacing var(--apple-space-8)

### Content Hierarchy

1. Primary: Page title, main action, active content - bold/large/dark
2. Secondary: Supporting info, form labels, descriptions - regular weight, muted
3. Tertiary: Timestamps, status badges, metadata, helper text - small, lightest color

Each level MUST have distinct visual weight through font-size, weight, and color.

## State Conventions

All states MUST use icon + text dual channels, never color alone:

| State | Icon | Color | Background |
|-------|------|-------|------------|
| Success | checkmark | var(--apple-success) | #34C7591A (10% opacity) |
| Warning | triangle | var(--apple-warning) | #FF95001A (10% opacity) |
| Error | circle-x | var(--apple-error) | #FF3B301A (10% opacity) |
| Info | circle-i | var(--apple-accent) | #007AFF1A (10% opacity) |
| Loading | spinner | var(--apple-ink-secondary) | transparent |
| Empty | illustration | var(--apple-ink-tertiary) | var(--apple-surface-secondary) |

## Dark Mode (Future)

All tokens will have dark mode equivalents. The mapping is semantic:

- Surfaces: white to near-black (#1C1C1E), secondary to dark gray (#2C2C2E)
- Ink: primary to near-white (#F5F5F7), secondary to light gray (#A1A1A6)
- Accent: #007AFF stays constant across modes

## Design Rationale

- Apple-inspired, not Apple-cloned: We adopt the precision minimalism philosophy - tight typography, clear visual hierarchy, restrained use of color, purposeful spacing - not the Apple marketing site aesthetics.
- Backend-appropriate density: Unlike consumer apps, our pages are information-dense (forms, lists, status tables). Tokens must support compact layouts while maintaining scanability.
- Non-breaking migration: New Apple tokens coexist with existing Cohere tokens. Old tokens are not deleted; components adopt new tokens gradually through a layered approach.
- Accessibility: All color contrasts must meet WCAG 2.1 AA (4.5:1 text, 3:1 large text).
