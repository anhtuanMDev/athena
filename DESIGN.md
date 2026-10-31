---
name: Athena
description: Admin console for the zero-backend game data repo and the mobile layouts built on it.
colors:
  primary: "oklch(70.5% 0.213 47.604)"
  primary-deep: "oklch(64.6% 0.222 41.116)"
  primary-ink: "oklch(55.3% 0.195 38.402)"
  primary-ink-dark: "oklch(75% 0.183 55.934)"
  primary-tint: "oklch(98% 0.016 73.684)"
  info: "oklch(54.6% 0.245 262.881)"
  info-dark: "oklch(62.3% 0.214 259.815)"
  danger: "oklch(57.7% 0.245 27.325)"
  danger-dark: "oklch(70.4% 0.191 22.216)"
  success: "oklch(59.6% 0.145 163.225)"
  success-dark: "oklch(76.5% 0.177 163.223)"
  warning: "oklch(76.9% 0.188 70.08)"
  page: "oklch(98.5% 0.002 247.839)"
  surface: "oklch(100% 0 0)"
  surface-raised: "oklch(96.7% 0.003 264.542)"
  border: "oklch(92.8% 0.006 264.531)"
  border-strong: "oklch(87.2% 0.01 258.338)"
  ink: "oklch(21% 0.034 264.665)"
  ink-muted: "oklch(55.1% 0.027 264.364)"
  page-dark: "oklch(13% 0.028 261.692)"
  surface-dark: "oklch(21% 0.034 264.665)"
  surface-raised-dark: "oklch(27.8% 0.033 256.848)"
  border-dark: "oklch(27.8% 0.033 256.848)"
  border-strong-dark: "oklch(37.3% 0.034 259.733)"
  ink-dark: "oklch(98.5% 0.002 247.839)"
  ink-muted-dark: "oklch(70.7% 0.022 261.325)"
typography:
  headline:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.333
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.page-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.page-dark}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-secondary-dark:
    backgroundColor: "{colors.surface-raised-dark}"
    textColor: "{colors.ink-dark}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  input-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
  card-dark:
    backgroundColor: "{colors.surface-dark}"
  nav-item:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  nav-item-active:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-ink}"
  nav-item-active-dark:
    textColor: "{colors.primary-ink-dark}"
  table-header:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "16px 24px"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Athena

## Overview

**Creative North Star: "The Ops Console"**

Athena is the control room behind a game-data app: the place where heroes, modes, enums, schemas and mobile layouts are edited and pushed to a GitHub-backed store. It should feel like an operations console: calm, dense, exact. Neutral gray carries the whole interface; orange appears only where something can be acted on or is currently selected. Nothing on screen competes with the data.

Density is deliberate. Body text sits at 14px, tables and forms are compact, and every surface is a solid layer separated by hairline borders rather than blur or glow. The console follows the operator's system setting and is designed in light and dark with equal care; neither is a derived afterthought.

The previous look mixed a Material theme with Tailwind classes, a glassy translucent shell, gradient text and glowing orange buttons. Those are rejected here: the console earns trust through precision, not effects.

**Key Characteristics:**
- Gray neutrals only, in solid tonal layers (page, surface, raised).
- One action color: orange, used for primary actions, focus and selection.
- Light and dark from the system setting, both first-class.
- Compact type: 14px body, 12px uppercase labels, 30px page titles.
- Hairline borders and small shadows; no blur, glow or gradients.

## Colors

A cool gray console with a single orange signal, plus blue, red, green and amber reserved for meaning.

### Primary
- **Signal Orange** (`primary`): the fill of primary buttons, the focus ring in dark mode, and the accent of selected items. Text on it is always the darkest page tone, never white.
- **Deep Signal** (`primary-deep`): hover and pressed state of primary buttons, and the focus ring in light mode.
- **Orange Ink** (`primary-ink` / `primary-ink-dark`): orange text and icons, such as the active navigation item; the darker step on light surfaces, the lighter step on dark ones.
- **Orange Wash** (`primary-tint`): background of the selected navigation item in light mode; in dark mode the same role is Signal Orange at 10% opacity.

### Secondary
- **Info Blue** (`info` / `info-dark`): links, informational notices and neutral highlights. It never fills a primary button.

### Tertiary
- **Alarm Red** (`danger` / `danger-dark`): destructive buttons, validation errors and failed states.
- **Clear Green** (`success` / `success-dark`): saved, synced and healthy states.
- **Caution Amber** (`warning`): pending and attention states.

### Neutral
- **Console Paper** (`page`) / **Console Night** (`page-dark`): the app background behind everything.
- **Panel** (`surface`) / **Panel Night** (`surface-dark`): cards, tables, inputs, the sidebar.
- **Raised Panel** (`surface-raised` / `surface-raised-dark`): table headers, secondary buttons, hovered rows, chips.
- **Hairline** (`border` / `border-dark`) and **Firm Hairline** (`border-strong` / `border-strong-dark`): dividers and outlines; the firm step is for inputs and focusable edges.
- **Ink** (`ink` / `ink-dark`): primary text.
- **Quiet Ink** (`ink-muted` / `ink-muted-dark`): secondary text, table headers and helper text.

### Named Rules
**The One Signal Rule.** Orange means "you can act here" or "this is selected". It is never decoration, never a background wash behind content, and never a second accent beside blue on the same control.

**The Dark-On-Orange Rule.** Text and icons on an orange fill use `page-dark`. White on Signal Orange measures 2.9:1 and fails; the dark tone measures 7:1.

**The Night Muting Rule.** In dark mode, secondary text is `ink-muted-dark`. The light-mode muted gray measures 3.7:1 on dark panels and must not be reused there.

## Typography

**Display Font:** Inter Variable (with ui-sans-serif, system-ui)
**Body Font:** Inter Variable (with ui-sans-serif, system-ui)
**Label/Mono Font:** ui-monospace for IDs, file paths and raw JSON

**Character:** One neutral grotesque at every size, so hierarchy comes from size, weight and case rather than from contrasting families. Monospace is a functional tool for machine values, not a stylistic voice.

### Hierarchy
- **Headline** (700, 1.875rem, 1.2, tight tracking): the one page title per screen, such as "Layout Builder: Hero".
- **Title** (600, 1.125rem, 1.556): section and card titles, dialog titles.
- **Body** (400, 0.875rem, 1.429): all interface text, form values, table cells, buttons (buttons at 500 or 600).
- **Label** (700, 0.75rem, 0.1em tracking, uppercase): table column headers and small section eyebrows only.
- **Mono** (400, 0.75rem): entity IDs, paths, JSON props and code-like values.

### Named Rules
**The One Headline Rule.** A screen has exactly one headline; everything else steps down to Title or Body. Bold is for the headline and labels, not for running text.

## Layout

The shell is a fixed 256px sidebar on large screens (1024px and up) with the content area scrolling beside it; below that, the sidebar collapses behind a 64px top bar with a menu button. Content uses Tailwind's 4px spacing scale, mostly steps of 8, 12, 16 and 24px: 12px inside controls, 16 to 24px inside cards, 24 to 32px between sections. Tables span the content width and scroll horizontally inside their own container rather than the page. Breakpoints are Tailwind's defaults (640, 768, 1024, 1280px); forms stack to one column below 768px.

## Elevation & Depth

Depth is tonal. The page, panel and raised-panel tones stack in solid layers, separated by 1px hairlines; there is no translucency, backdrop blur or colored glow anywhere in the console. Shadows are small and neutral and only lift what genuinely floats above the page.

### Shadow Vocabulary
- **Rest lift** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): buttons and inputs at rest, the selected navigation item.
- **Overlay** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): menus, popovers, toasts and dialogs.

### Named Rules
**The Solid Layer Rule.** Every surface is opaque. If something needs to read as "above", give it the next tonal step and, only if it floats, the overlay shadow.

## Shapes

Gently rounded, never pill-shaped except for chips and avatars. Buttons, inputs and navigation items use 8px corners; cards, tables and panels 12px; dialogs 16px; status chips and avatars are fully round. Borders are 1px hairlines in the neutral border tones; outlines thicken only for focus.

## Components

### Buttons
Compact and decisive; one primary per view.
- **Shape:** gently rounded (8px).
- **Primary:** Signal Orange fill, Console Night text at weight 600, 8px 16px padding, rest lift.
- **Hover / Focus:** hover steps to Deep Signal; keyboard focus draws a 2px ring with a 2px offset, Deep Signal on light surfaces and Signal Orange on dark ones. Transitions animate color only, at 150ms.
- **Secondary:** Raised Panel fill with Ink text; hover steps one tonal layer darker (lighter in dark mode).
- **Ghost:** no fill, Quiet Ink text, Raised Panel on hover; for toolbar and row actions.
- **Danger:** Alarm Red fill with white text, only for confirming destructive actions inside a confirmation step.

### Chips
- **Style:** Raised Panel background, Ink text in the label style, fully round, 2px 8px padding.
- **State:** status chips swap to the meaning colors (green, amber, red) as a 10% wash with the matching ink.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Panel / Panel Night.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 24px; 16px on screens under 768px.

### Inputs / Fields
- **Style:** Panel background, 1px Firm Hairline, 8px corners, 8px 12px padding, body type.
- **Focus:** border and 2px ring switch to the orange focus tone of the current mode.
- **Error / Disabled:** errors turn the border Alarm Red with the message directly below the field; disabled fields drop to Raised Panel with Quiet Ink text.

### Navigation
- **Style:** the sidebar is a Panel column with a Hairline right edge. Items are body text at weight 500 in Quiet Ink with a 16px icon, 10px 12px padding and 8px corners.
- **States:** hover moves to the Raised Panel tone and Ink text; the active item uses Orange Wash with Orange Ink (in dark mode a 10% Signal Orange wash with the lighter Orange Ink).
- **Mobile:** below 1024px the sidebar becomes a drawer opened from the 64px top bar.

### Data Table
The console's signature surface.
- **Container:** 12px corners, Hairline border, scrolls horizontally inside itself.
- **Header:** Raised Panel row, label type in Quiet Ink, 16px 24px cells.
- **Rows:** Panel background, Hairline dividers, hover to Raised Panel; numeric columns use tabular figures.

## Do's and Don'ts

### Do:
- **Do** use `primary` only for the primary action, focus rings, selection and the active navigation item.
- **Do** put `page-dark` text on every orange fill.
- **Do** use `primary-deep` for focus rings on light surfaces and `primary` on dark ones, drawn with `:focus-visible`.
- **Do** write every color for both modes, following the system setting; use `ink-muted-dark` for secondary text on dark surfaces.
- **Do** separate layers with solid tones and 1px hairlines.
- **Do** animate color and opacity only, at 150ms, and stop skeleton pulses under `prefers-reduced-motion`.

### Don't:
- **Don't** use blue for primary actions; blue is for links and information.
- **Don't** use gradient fills, gradient text or colored glow shadows on any element.
- **Don't** use translucent panels, `backdrop-blur` or blurred decorative blobs.
- **Don't** put white text on Signal Orange.
- **Don't** use `transition: all`.
- **Don't** introduce zinc, slate or other neutral families; the console's neutrals are gray.
