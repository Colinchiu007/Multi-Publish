# Multi-Publish Design System

## Product Identity

**Multi-Publish** is a SaaS content management and publishing tool built as an Electron desktop application. It serves content creators, operators, and internal teams who manage multi-platform content publishing across WeChat Official Account, Zhihu, Douyin, and Xiaohongshu.

## Design Philosophy

Inspired by Apple's precision minimalism. Not a visual clone of apple.com, but adoption of these principles:

- **Tight typography** with clear visual hierarchy
- **Restrained color palette** - one accent, semantic states, neutral surfaces
- **Purposeful spacing** - every pixel has meaning
- **Border-based component definition** over heavy shadows
- **Progressive disclosure** for complex forms and configurations
- **Icon + text dual channels** for all status indicators

## Color System

### Surfaces
- Primary surface: #FFFFFF (cards, panels, content areas)
- Secondary surface: #F5F5F7 (sidebar, navigation, muted backgrounds)
- Tertiary surface: #E8E8ED (code blocks, disabled areas)

### Text
- Primary ink: #1D1D1F (headings, body text)
- Secondary ink: #6E6E73 (labels, descriptions, timestamps)
- Tertiary ink: #AEAEB2 (placeholders, disabled text)

### Accent
- Primary accent: #007AFF (buttons, links, focus rings)
- Hover: #0056CC

### Semantic States
- Success: #34C759
- Warning: #FF9500
- Error: #FF3B30

### Borders
- Default: #D2D2D7
- Subtle: #E5E5EA

## Typography

### Font Stack
- Display: SF Pro Display, Inter, PingFang SC, system-ui, sans-serif
- Body: SF Pro Text, Inter, PingFang SC, system-ui, sans-serif
- Monospace: SF Mono, JetBrains Mono, Consolas, monospace

### Scale
- xs: 11px / sm: 13px / base: 15px / md: 17px / lg: 20px / xl: 24px / xxl: 28px
- Weights: 400 regular, 500 medium, 600 semibold, 700 bold

## Spacing

Base unit: 4px
Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64

## Border Radius

- sm: 6px (buttons, inputs)
- md: 10px (cards, panels)
- lg: 14px (modals, large containers)
- xl: 18px (feature cards)
- pill: 9999px (badges, tags, avatars)

## Shadows

- sm: 0 1px 2px rgba(0,0,0,0.04) - hover lift
- md: 0 2px 8px rgba(0,0,0,0.08) - dropdown menus
- lg: 0 8px 24px rgba(0,0,0,0.12) - modals, popovers

## Motion

- fast: 120ms
- normal: 200ms
- slow: 320ms
- ease: cubic-bezier(0.25, 0.1, 0.25, 1)

## Component Contracts

### Buttons
- primary: accent fill, white text, 6px radius, 12px 20px padding
- secondary: transparent fill, accent text + 1px accent border
- ghost: transparent, no border, secondary ink text
- danger: error fill, white text (destructive only)

### Cards
- 1px subtle border (no heavy shadow)
- 10px radius
- Hover: subtle shadow-sm elevation

### Inputs
- 1px border, 6px radius
- Focus: 2px accent outline ring
- Placeholder: tertiary ink

### Badges
- Pill shape (9999px radius)
- Semantic color at 10% opacity background

### Modals
- Overlay: rgba(0,0,0,0.3) with 200ms fade
- Content: 14px radius, shadow-lg

## Layout

### Desktop Structure
- Sidebar: 240px fixed, secondary surface
- Module Nav: horizontal tabs, primary surface
- Content: remaining width, primary surface
- Max content width: 1200px centered

### Density Modes
- High (lists/tables): 40px row height, 8px/12px padding
- Medium (forms/cards): 48px row height, 12px/16px padding
- Low (dashboards): 24px/32px padding, 32px section gaps

### Content Hierarchy
1. Primary: title, main action, active content (bold/large/dark)
2. Secondary: labels, descriptions, supporting info (regular/muted)
3. Tertiary: timestamps, metadata, helpers (small/lightest)

## Page Types

### /publish (Content Publishing)
- Three-zone layout: Editor (primary 70%), Target/Account (secondary 30%), Features (tertiary collapsible)
- Progressive disclosure: core flow visible by default, advanced features expandable
- Sticky publish button in secondary zone

### /publish/history (Publish History)
- Table/list view with status indicators
- Filter by platform, status, date range
- Quick actions: retry, view, delete

### /accounts (Account Management)
- Card grid or list view
- Account status indicators (connected/disconnected/error)
- Platform-specific account details

## Accessibility

- All color contrasts meet WCAG 2.1 AA (4.5:1 text, 3:1 large text)
- All interactive states visible without color alone
- Focus indicators present on all focusable elements
- Semantic HTML structure with proper heading hierarchy
