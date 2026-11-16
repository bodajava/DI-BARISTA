# Signal AI Design System (AI Chat & Agent Consoles)

> Clean AI chat product on a quiet white canvas with Geist type and exactly one signal-orange for the assistant's live state. Built for copilots, assistants and agent consoles.

## Overview & Personality
- **Aesthetic**: Minimal AI Chat
- **Industry**: AI / Copilots
- **Default Mode**: Light (`#f9fafb` canvas, `#14161a` ink)
- **Live State Signal Color**: `#e8590c` (light) / `#ff7a2e` (dark)
  - Used strictly for live state: streaming caret, thinking dots, stop button, composer focus ring.
- **Display & Body Font**: `Geist`
- **Mono Font**: `Geist Mono`
- **Corners**: 6px, 10px, 16px, 22px, full: 9999px
- **Chat Layout**: Centered 720px conversation column, floating 16px composer card pinned 24px from bottom.
- **Turns**:
  - User messages in a `muted` rounded block.
  - Assistant replies are plain uncontained prose.
  - Tool calls collapsed to a single mono row with an expandable drawer.
  - Model and latency telemetry in Geist Mono.

## Liquid Glass Integration
- Embedded `.liquid-glass` optics on top status bar and floating composer cards for refraction and depth.
