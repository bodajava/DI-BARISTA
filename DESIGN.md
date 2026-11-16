# Tri-Design Systems & Liquid Glass Specification

This project utilizes a cohesive multi-system architecture tailored to three distinct contexts, enhanced with shared **Liquid Glass** material optics:

---

## 1. E-Commerce Storefront: Maison Folio
- **Scope**: Public customer storefront (`/`)
- **Aesthetic**: Luxury Couture Fashion Lookbook & Atelier Commerce
- **Default Mode**: Light (`#f4f0e8` ivory paper, `#0e0d0c` ink)
- **Typography**: Bodoni Moda (hero display up to 168px), Inter Tight (15px body), JetBrains Mono (12px labels)
- **Corners**: Sharp zero radius (`0px`)
- **Primary CTA**: Solid black rectangle inverting to ivory outline on hover
- **Implementation**: `src/styles/maison-folio.css`

---

## 2. Admin Console & Operations: Linear Orbit
- **Scope**: Staff workspace & issue management (`/admin`)
- **Aesthetic**: Minimal Dark Hairline Workspace
- **Default Mode**: Dark (`#08090a` near-black canvas, `#5e6ad2` indigo action)
- **Typography**: Inter Tight (display), Inter (14px body), Fira Code (12px mono)
- **Corners**: Hairline 4px / 6px / 10px / 14px
- **Chrome**: 1px dividers at 8% white, 40px rows, keyboard-first affordances (⌘K)
- **Implementation**: `src/styles/linear-orbit.css` (scoped via `.theme-linear-orbit`)

---

## 3. Dedicated AI Intelligence Console: Signal AI
- **Scope**: Executive AI Copilot & Analyst chat interface (`/admin/ai`)
- **Aesthetic**: Minimal AI Conversation Terminal
- **Default Mode**: Light (`#f9fafb` quiet canvas, `#14161a` ink) with full dark mode support
- **Signal Color**: Live orange (`#e8590c` / `#ff7a2e`) reserved strictly for live state (streaming caret, thinking dots, stop, composer focus)
- **Typography**: Geist (display & body), Geist Mono (telemetry, tokens, tool calls)
- **Turns & Composer**: Uncontained assistant prose, user in muted blocks, floating 16px composer card
- **Implementation**: `src/styles/signal-ai.css` (scoped via `.theme-signal-ai`)

---

## 4. Shared Material System: Liquid Glass
- **Scope**: Applied across all three design systems for specular refraction, status navigation bars, floating docks, dialog surfaces, and pill badges.
- **Optics**: High-saturation blur backdrop filters, 1px inner specular highlights, subtle outer border rings.
- **Implementation**: `src/styles/liquid-glass.css` (`.liquid-glass`, `.liquid-glass-dock`, `.liquid-glass-pill`, `.liquid-glass-dialog`)
