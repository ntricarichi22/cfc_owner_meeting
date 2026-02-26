# UI Mockups (Source of Truth)

This folder contains the **authoritative visual specs** for the CFC Owners Meeting app UI.
When implementing or restyling UI, **match the PNGs in this folder first**. If code and mockups conflict, **the mockups win**.

---

## Mockups (Source of Truth)

- `proposal-slide-with-voting.png`  
  Final target for the **Proposal Slide Template**.

- `admin-slide-option-b.png`  
  Final target for the **Admin Slide Template (Option B)** — same header band system as proposal slides, with one main content card framed by a blue mat.

- `welcome-screen-with-dropdown.png`  
  Final target for the **Welcome / Team Select page** (neo-brutalism, clean, not overstimulating).

- `title-slide.png`  
  Final target for the **Title Slide** shown first inside the meeting carousel.

---

## Non-Negotiables (Guardrails)

When implementing these designs:

- **Do not** change Supabase tables/columns, SQL, RLS policies, or API payload shapes.
- **Do not** change routes, navigation, meeting flow, or deep link behavior.
- **Do not** refactor meeting/voting/session hooks except to move styling wrappers.
- UI work should be **layout + styling only** for the relevant pages/components.

---

## Colors (Exact Hex)

- Paper background: `#F6F0E6`
- Ink (borders + primary text): `#111111`
- Electric Blue: `#22A3FF`
- Rocketpop Red (chips/accent): `#FF3B30`
- Voting Gold: `#BF8F00`

Status:
- Approved Green: `#16A34A`
- Rejected Red: `#DC2626`

---

## Borders + Shadows (Print / Neo-brutal)

- Thick ink border: ~`4px solid #111111`
- Hard offset shadow (no blur): `8px 8px 0 #111111`
- Shadows should read **bottom-right**, not glow/outline.

---

## Typography

Match the mockups: bold, condensed, “poster” feel for titles and headers.

- Slide title: large, all caps, heavy weight, ink color.
- Section headers: all caps, bold.
- Body text:
  - DETAILS panel: white on blue
  - Pros/Cons: ink on paper
  - Admin content: ink on paper

If the exact font isn’t available, use the closest condensed display font already in the project.

---

## Welcome / Team Select Page

Match `welcome-screen-with-dropdown.png`:
- Full screen neo-brutal poster layout
- Clear hierarchy: big title, team dropdown, gold “Enter Meeting” button
- Use paper background, ink borders, and red/blue/gold accents
- Must keep existing team selection + session creation behavior (no logic changes)

---

## Title Slide

Match `title-slide.png`:
- Full screen split-block composition
- Left area: “2026 CFC Owners Meeting”
- Date: “March 1, 2026” in a bold label
- Right area: solid/texture blue block with subtle CFC mark
- No navigation UI clutter; this is a slide in the meeting carousel
- Must not affect meeting logic or slide order

---

## Definition of Done

- Welcome page matches `welcome-screen-with-dropdown.png`.
- Title slide matches `title-slide.png`.
- Proposal/admin slides remain intact and functional.
- No DB/API changes and no regressions to meeting flow, voting, or deep links.
