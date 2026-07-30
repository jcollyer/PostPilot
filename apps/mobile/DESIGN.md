---
name: PostPilot Mobile
description: The flight deck for a queue that runs itself — a glanceable iOS monitor for creators who have walked away.
colors:
  deep-slate-navy: "#2d3f63"
  navy-wash: "#dbe2ef"
  ground: "#f8fafc"
  surface: "#ffffff"
  ink: "#0f172a"
  ink-secondary: "#334155"
  ink-tertiary: "#64748b"
  ink-quiet: "#94a3b8"
  hairline: "#e2e8f0"
  signal-ok: "#047857"
  signal-ok-ink: "#065f46"
  signal-ok-surface: "#d1fae5"
  signal-ok-border: "#a7f3d0"
  signal-warn: "#b45309"
  signal-warn-ink: "#92400e"
  signal-warn-surface: "#fef3c7"
  signal-critical: "#b91c1c"
  signal-critical-surface: "#fef2f2"
  signal-critical-border: "#fecaca"
  destructive: "#ef4444"
typography:
  display:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: "36px"
  headline:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
  title:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  body:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  caption:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  eyebrow:
    fontFamily: "SF Pro Text, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.025em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.deep-slate-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: "{typography.label}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: "{typography.label}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 12px"
    typography: "{typography.body}"
  status-pill-ok:
    backgroundColor: "{colors.signal-ok-surface}"
    textColor: "{colors.signal-ok-ink}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.caption}"
  status-pill-warn:
    backgroundColor: "{colors.signal-warn-surface}"
    textColor: "{colors.signal-warn-ink}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.caption}"
  avatar:
    backgroundColor: "{colors.navy-wash}"
    textColor: "{colors.deep-slate-navy}"
    rounded: "{rounded.full}"
    height: "32px"
    width: "32px"
---

# Design System: PostPilot Mobile

## Overview

**Creative North Star: "The Flight Deck"**

PostPilot's promise is that the creator walks away. The web app is where work happens; this app is the panel they glance at from a coffee shop to confirm the machine is still flying, and the place they land when something needs a hand. A flight deck earns trust by being legible at arm's length, by never decorating a gauge, and by staying silent until it has something real to say. Every decision here answers to that.

The system is quiet and factual. Components state; they never sell. White cards sit on a cool slate ground, separated by hairline rules rather than shadows. Type does the ranking work — six sizes of one system face, no display font, no ornament. The navy appears on interactive elements and essentially nowhere else, so the eye learns that navy means *you can touch this*. Color is otherwise rationed to status: green, amber, and red exist only to report the state of a connection or a queue, never to brighten a layout.

The current implementation is honest about its scope but thin on identity: it leans on default Tailwind slate utilities rather than its own token layer, ships no icons, no motion, no dark appearance, and no accessibility metadata. This file records what is genuinely built and commits the invariants — flat depth, rationed color, dark as a first-class appearance — that future work must hold.

**Key Characteristics:**

- Glanceable first: the answer to "is it still running?" resolves in under two seconds
- Flat by construction — hairline borders and tonal grounds, never shadows
- One tint (Deep Slate Navy) reserved for interaction; status color reserved for status
- System typeface only; hierarchy carried by size and weight, not by family
- Two appearances, light and dark, treated as equals

## Colors

A cool, low-saturation palette: one navy tint against a six-step slate ink ramp, with a three-tone status vocabulary that is the only saturated color allowed on screen.

### Primary

- **Deep Slate Navy** (`#2d3f63`): The single tint. Primary button fills, the sign-in mark, link and nav-tint text, avatar initials, and every loading spinner. It marks interactivity and brand presence — nothing else. Its restraint is what makes a green "Connected" or a red "Reconnect needed" read instantly.
- **Navy Wash** (`#dbe2ef`): The tint at surface strength. Currently the header avatar's fill; the correct choice for any tinted container that needs to belong to the navy without shouting.

### Neutral

- **Ground** (`#f8fafc`): The cool slate floor every authenticated screen sits on. It exists to make white cards read as raised without a shadow.
- **Surface** (`#ffffff`): Cards, input fills, the navigation bar, and the full sign-in screen. Pure white against the ground is the entire depth model.
- **Ink** (`#0f172a`): Headlines, stat values, and input text. The heaviest voice.
- **Ink Secondary** (`#334155`): Row labels and ghost-button text.
- **Ink Tertiary** (`#64748b`): Supporting copy, hints, stat captions, and eyebrow labels — the most-used non-black ink in the app.
- **Ink Quiet** (`#94a3b8`): Placeholders, the footer line, and the "Unavailable" connection state. The floor of legibility; never use it for anything a user must read.
- **Hairline** (`#e2e8f0`): The 1px rule that draws every card, input, and outline button. This is the workhorse of the entire depth system.

### Tertiary

The status vocabulary. These three hues map directly to the `ok` / `warn` / `bad` tones returned by `connectionLabel`, and they are the only saturated colors permitted in the interface.

- **Signal OK** (`#047857`) with surface (`#d1fae5`), border (`#a7f3d0`), and pill ink (`#065f46`): a live connection, a running queue, a successful account creation.
- **Signal Warn** (`#b45309`) with surface (`#fef3c7`) and pill ink (`#92400e`): a paused queue or paused platform — deliberate states, not failures.
- **Signal Critical** (`#b91c1c`) with surface (`#fef2f2`) and border (`#fecaca`): a connection that needs reconnecting, a sign-in error, a destructive confirmation.
- **Destructive** (`#ef4444`): the fill of destructive buttons and the error stroke on invalid inputs. Brighter than Signal Critical because it sits behind white text.

### Named Rules

**The One Tint Rule.** Deep Slate Navy marks interaction and brand, nothing else. If a navy element cannot be tapped and is not the app mark, it is wrong. Decoration is not the tint's job.

**The Status-Only Saturation Rule.** Green, amber, and red report machine state — a connection, a queue, an error. They never appear as accent, illustration, or emphasis. A screen with no problems shows no saturated color at all, and that absence is the "everything is fine" signal.

**The Two Appearances Rule.** Light and dark are equals, not a default and a concession. No component may hardcode a hex value; every color resolves through a semantic role that has both a light and a dark answer. Raw hex inside a screen or component is a defect, not a shortcut.

### Dark appearance (committed, not yet implemented)

`app.json` already declares `userInterfaceStyle: "automatic"`, so the app promises dark mode today and does not deliver it — every value above is a hardcoded light color. The committed dark counterparts:

| Role | Light | Dark |
|---|---|---|
| Ground | `#f8fafc` | `#000000` |
| Surface | `#ffffff` | `#1c1c1e` |
| Ink | `#0f172a` | `#f8fafc` |
| Ink Secondary | `#334155` | `#c7cdd6` |
| Ink Tertiary | `#64748b` | `#98a2b3` |
| Ink Quiet | `#94a3b8` | `#6b7480` |
| Hairline | `#e2e8f0` | `#2f3336` |
| Deep Slate Navy | `#2d3f63` | `#8fa5cf` |
| Navy Wash | `#dbe2ef` | `#2a3245` |
| Signal OK | `#047857` | `#34d399` |
| Signal Warn | `#b45309` | `#fbbf24` |
| Signal Critical | `#b91c1c` | `#f87171` |

The dark tint lightens deliberately: `#2d3f63` on a near-black ground fails contrast as text or as a tappable label, so the dark appearance inverts it to a light navy that clears 4.5:1. Prefer iOS semantic system colors (`label`, `secondaryLabel`, `systemBackground`, `separator`) wherever one matches the role; the table above is for the roles the platform has no answer for.

## Typography

**Display Font:** none — the system face carries everything.
**Body Font:** SF Pro (San Francisco), via the React Native system default.
**Label/Mono Font:** none. No tabular or monospaced figures are in use, though queue numbers would benefit from them.

**Character:** Neutral to the point of invisibility, which is correct for a panel of facts. Personality comes from the size jumps and the ruthless weight discipline — 400 for prose, 500 for eyebrows, 600 for anything structural, 700 only on the sign-in title. Nothing is italic. Nothing is letterspaced except the uppercase eyebrow.

### Hierarchy

- **Display** (700, 30px, 36px line): The sign-in screen's "Welcome back" only. The single loudest moment in the app.
- **Headline** (600, 24px, 32px line): The dashboard greeting, "Hello {name}". One per screen, at the top.
- **Title** (600, 20px, 28px line): Stat values in the queue-health grid — the numbers the whole screen exists to deliver.
- **Body** (400, 16px, 24px line): Input text and the sign-in subtitle. The reading size.
- **Label** (600, 14px, 20px line): Card section headings ("Queue health", "Connected accounts"), field labels, row titles, button text.
- **Caption** (400, 12px, 16px line): Stat labels, hints, empty-state lines, the footer.
- **Eyebrow** (500, 12px, uppercase, 0.025em tracking): Card kickers — "NEXT SCHEDULED POST", "LAST PUBLISHED". The only uppercase in the system.

### Named Rules

**The Dynamic Type Rule.** The sizes above are the *current* fixed implementation and are a platform defect on iOS. Every one must resolve to a system text style so it follows the reader's size setting: Display → Title1, Headline → Title2, Title → Title3, Body → Callout, Label → Subheadline, Caption/Eyebrow → Caption1. Nothing below 11pt, ever. A hardcoded `fontSize` in a screen is a bug.

**The Two-Weight Rule.** Within any single card, use at most two weights. The eyebrow-plus-title pattern (500 uppercase caption over 600 label) is the ceiling of contrast a card needs; a third weight makes the panel look busy rather than instrumented.

## Layout

A single-column scroll on every screen — no grid, no sidebar, no tabs. Screens are `ScrollView`s with the ground color and a uniform inset, and cards are the only structural unit.

Screen insets differ by intent and should be normalized: the dashboard uses 20px with a 16px gap between cards, settings uses 16px with 60px of bottom padding to clear the home indicator, and sign-in uses 32px with vertically centered content. The dashboard's 20px/16px pairing is the reference rhythm; sign-in's 32px is the deliberate exception for a single centered form.

Inside a card, padding is a flat 16px and children stack with 12–20px gaps. The queue-health stats break this pattern with a two-up wrap (`w-1/2` per cell, 8px bottom margin) — the only multi-column arrangement in the app, and the right one, since four short number/label pairs read faster paired than stacked.

The spacing scale in practice is 6 / 8 / 12 / 16 / 20 / 32. Sign-in wraps its content in `SafeAreaView` with top and bottom edges; the authenticated screens rely on the navigation stack for top inset and have no explicit bottom-edge handling.

**The Card-Per-Question Rule.** Each card answers exactly one question the creator might have — how much is left, what is next, what went out last, what is connected. Never merge two questions into one card to save vertical space; the scroll is cheap and the scan is not.

## Elevation & Depth

**There are no shadows in this system, and that is doctrine, not an omission.** Zero `shadow-*` utilities and zero `elevation` or `shadowColor` properties appear anywhere in the app. Depth is drawn, never lifted: a white surface on a cool slate ground, bounded by a 1px hairline. Two flat planes, one rule between them, and nothing floats.

This is what makes the panel read as instrumentation rather than as a stack of floating web cards, and it is the single most load-bearing visual decision in the app.

### Named Rules

**The Drawn-Not-Lifted Rule.** Depth comes from tonal contrast plus a hairline. Surfaces are flat at rest and flat on press — the only press feedback is opacity. Never add a shadow to a card, button, input, or list row to suggest hierarchy; if two things need separating, change the ground or draw the rule.

**The Temporary-Layer Exception.** The one place shadow is permitted is a genuinely transient layer the platform itself elevates — a sheet, popover, action sheet, or alert. There, use the system material and the platform's own shadow, never a hand-rolled one. Shadow means "this is temporary and will dismiss," which is precisely why permanent surfaces may not borrow it.

## Shapes

Soft-rectangular throughout, with radius encoding scale rather than emphasis: 8px for controls (buttons, inputs, banners), 12px for containers (cards), 16px for the largest branded object (the sign-in mark), and fully round for anything that reads as a token (status pills, the avatar).

Borders are always exactly 1px and always Hairline, except where a control is reporting an error, in which case the same 1px stroke switches to Destructive. There are no dividers, no separators inside cards, no dashed or double strokes, and no clipping or masking beyond the avatar's circle.

The app contains no icons at all — `lucide-react-native` is installed but never imported. There is no illustration, no imagery, and no empty-state art; empty states are plain sentences in Caption.

**The Radius-Means-Scale Rule.** Radius reports the size of the thing, not its importance. A control is 8px whether it is primary or ghost; a container is 12px whether it holds a stat grid or a single sentence. Never raise a radius to make something feel friendlier.

## Components

### Buttons

Quiet and factual — a rectangle of color with a centered word, no icon, no shadow, no border on the filled variants.

- **Shape:** Softly rounded (8px), full-width by default, content centered in a row.
- **Primary:** Deep Slate Navy fill with white 600-weight text. Sizes are `sm` (12/8px padding), `md` (16/12px, the default) and `lg` (20/16px).
- **Outline:** White fill with a 1px Hairline border and Ink text — the standard secondary action ("Sign out", "Cancel").
- **Ghost:** Transparent with Ink Secondary text. Declared and available but currently unused in any screen.
- **Destructive:** Destructive fill with white text, used for account deletion.
- **Press / Disabled:** 80% opacity on press, 50% on disabled. Loading swaps the label for a spinner tinted to match the variant's text color.
- **Known gap:** at `sm` and `md` the touch target falls short of the 44×44pt iOS minimum, and no button carries an `accessibilityRole` or label.

### Cards / Containers

The structural atom. Everything on an authenticated screen lives in one.

- **Corner Style:** 12px.
- **Background:** Surface white on the Ground.
- **Shadow Strategy:** None, ever. See Elevation & Depth.
- **Border:** 1px Hairline on all sides.
- **Internal Padding:** 16px, with 12–20px gaps between children.

### Inputs / Fields

- **Style:** White fill, 1px Hairline border, 8px radius, 12px padding on both axes, 16px Ink text. The label sits above at Label weight in Ink Secondary with a 6px gap.
- **Focus:** Nothing. The system provides only the caret — there is no border shift, glow, or ring. This is the most conspicuous missing state in the app.
- **Error:** Border switches to Destructive and a 12px Destructive message replaces the hint below.
- **Disabled:** No built-in treatment; the settings screen passes `opacity: 0.6` inline for the read-only email field.

### Navigation

- **Style:** A native stack with a white bar, Ink 600-weight inline titles, and a Deep Slate Navy tint on interactive bar elements. Content sits on the Ground.
- **Structure:** Two authenticated screens — Home and Settings — with no tab bar. Settings is reached only by tapping the header avatar.
- **Known gap:** for two top-level sections iOS expects a tab bar, and titles are inline where a large collapsing title belongs on a top-level screen.

### Status Pill

The signature component. A fully rounded 12px chip carrying the queue's own state in the dashboard header — Signal OK surface with OK ink when running, Signal Warn surface with Warn ink when paused. It is the first thing the eye lands on and often the only thing the creator came to check.

### Connection Row

The second signature pattern: a platform name in 14px Ink Secondary, right-aligned against a 12px status word colored by tone — Signal OK for connected, Signal Critical for reconnect-needed, Signal Warn for paused, Ink Quiet for unavailable. The status is *text only*; there is no dot, badge, or icon carrying the meaning.

**The Tone-Comes-From-Data Rule.** Connection and queue states are colored by the `tone` value that `connectionLabel` returns, never by a literal chosen at the call site. Adding a state means extending that function, so a status can never be styled two different ways in two different places.

### Banners

Inline notice blocks on sign-in: 8px radius, 12px padding, a 50-level tinted surface with a 200-level border and 14px tinted text. Errors use the critical ramp; confirmations use the OK ramp. Note the existing drift — the notice banner's green surface (`#ecfdf5`) is one step lighter than the status pill's (`#d1fae5`); the pill value is canonical.

## Do's and Don'ts

### Do:

- **Do** route every color through a semantic role that has a light and a dark answer. Prefer iOS semantic colors (`label`, `secondaryLabel`, `systemBackground`, `separator`) where one fits the role.
- **Do** keep Deep Slate Navy (`#2d3f63`) for interaction and brand only, and let a problem-free screen show no saturated color at all.
- **Do** draw depth with the Ground/Surface tonal step plus a 1px Hairline (`#e2e8f0`) — the flat model is the identity.
- **Do** map every type size to a system text style so Dynamic Type works; 11pt is the absolute floor.
- **Do** give every tappable control a 44×44pt target and an accessibility role and label. There are currently zero in the app.
- **Do** derive status colors from the `tone` value returned by `connectionLabel`, so a state can never be styled inconsistently.
- **Do** use platform controls and SF Symbols when icons and controls are introduced — the app has neither today, so there is no legacy to preserve.
- **Do** give inputs a visible focus treatment; the absence of one is a gap, not a style.

### Don't:

- **Don't** add a shadow to any permanent surface. Cards, buttons, inputs, and rows are flat at rest and flat on press. Shadow is reserved for platform-elevated temporary layers.
- **Don't** hardcode a hex value in a screen or component. The settings delete-confirmation block (raw `#fef2f2`, `#fecaca`, `#dc2626`, `#ef4444` inline styles) is the anti-pattern to remove, not to copy.
- **Don't** reach for raw Tailwind palette utilities (`text-slate-500`, `bg-emerald-100`) instead of the token layer. This is the incumbent system's central defect: `tailwind.config.js` declares `muted` and `mutedForeground` that nothing uses, while screens paint from default slate classes the config does not own.
- **Don't** let this become the generic Tailwind admin panel — interchangeable slate-and-white rounded cards with no point of view. That is the nearest failure mode, because it is close to where the app sits today.
- **Don't** ship a ported website: web-shaped full-width buttons where a native control belongs, custom navigation instead of the system stack, hover-dependent affordances, or fixed type that ignores the reader's size setting.
- **Don't** introduce charts, graphs, KPI tiles, or a calendar. The product forbids the features; the design forbids the look.
- **Don't** style status with a literal color at the call site, and don't let status meaning live in color alone — pair it with the word, as the connection rows already do.
- **Don't** raise a radius or add a weight to make something feel friendlier. Radius reports scale; hierarchy comes from size and position.
