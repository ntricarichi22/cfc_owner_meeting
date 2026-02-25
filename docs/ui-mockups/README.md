# UI Mockups (Source of Truth)

This folder contains the **authoritative visual specs** for the CFC Owners Meeting app UI.  
When implementing or restyling UI, **match the PNGs in this folder first**. If code and mockups conflict, **the mockups win**.

---

## Mockups

- `proposal-slide-with-voting.png`  
  Final target for the **Proposal Slide Template** (includes the gold “START VOTING” button and the overall layout / typography / shadows).

---

## Non-Negotiables (Guardrails)

When implementing this design:

- **Do not** change Supabase tables/columns, SQL, RLS policies, or API payload shapes.
- **Do not** change routes, navigation, meeting flow, or deep link behavior.
- **Do not** refactor meeting/voting/session hooks except to move styling wrappers.
- This work is **layout + styling only** for the proposal slide template (and related UI components it directly uses).

---

## Colors (Use exact hex values)

- Paper background: `#F6F0E6`
- Ink (borders + primary text): `#111111`
- Electric Blue (Details panel): `#22A3FF`
- Accent Red (chips): `#FF3B30`
- Voting Gold (Start Voting button): `#BF8F00`

Voting results (status chip + badges):
- Approved Green: `#16A34A`
- Rejected Red: `#DC2626`

---

## Typography

Match the mockup style: bold, condensed, “poster” feel for titles and headers.

- Proposal Title: large, all caps, heavy weight, ink color.
- Section headers (“DETAILS”, “PROS”, “CONS”): all caps, bold, ink color.
- Body text:
  - DETAILS panel: white text on blue background
  - PROS/CONS cards: ink text on paper background

If a specific font is not available, choose the closest condensed display font already in the project, and keep weights/sizes consistent with the mock.

---

## Proposal Slide Layout (Target)

The proposal slide template should visually match `proposal-slide-with-voting.png`.

### Header band (top strip)
- Full width, paper background, ink border.
- Left side: Proposal title (e.g., “PROPOSAL #1: AMEND THE CLUB YEAR”).
- Under title: chips row:
  - “PROPOSED BY: <TEAM>”
  - “EFFECTIVE DATE: <YEAR> CLUB YEAR”
  - Constitution deep link chip(s), e.g. “ARTICLE 4, SECTION 1”
- Right side: large gold **START VOTING** button.

### Content area (below header)
Two-column layout:

#### Left: DETAILS panel (Electric Blue)
- Takes ~60% width.
- Full height of the content area.
- Blue fill: `#22A3FF`
- White text.
- “DETAILS” label with document icon near the top-left (as shown).
- Body supports rich text (bullets, underline, etc.) and should be readable and spaced.

#### Right: PROS + CONS stacked cards (~40% width)
- Two cards stacked vertically (Pros on top, Cons on bottom).
- Paper fill.
- Ink border.
- Red accent for the header label and icon:
  - Pros: thumbs-up icon + “PROS”
  - Cons: thumbs-down icon + “CONS”
- Body text ink color.

---

## “1|” Formatting Rules (Pros/Cons)

Pros and Cons lists use the `1|` pattern.

- The `1|` token must stay **on the same line** as the text.
- Render as a two-column row:
  - Left fixed column: the marker (e.g., `1|`)
  - Right flexible column: the content text
- Ensure markers align vertically across list items.
- Avoid awkward wrapping where single words break onto their own lines.

---

## Borders, Shadows, and Card Style

This UI uses “paper + ink” styling with bold borders and **hard offset shadows**.

### Ink border
- Use a thick border like `4px solid #111111` (or the closest match used in the project).

### Hard shadow (no blur)
Use an offset shadow that looks like printed poster depth:

- Default: `8px 8px 0 #111111`
- No blur. No transparency.
- Shadow should appear primarily on the **bottom and right** (not as an outline/glow).

### Pros/Cons cards
- Keep the ink shadow.
- Do **not** place the red accent as a glow/outline around the whole card.
- If you want red emphasis, use it for:
  - header text/icon color
  - optional thin top border accent
But the main shadow remains a hard “ink” shadow like the mock.

---

## Voting Button / Status Chip

### Start Voting (before tally)
- Placement: right side of header band.
- Fill: gold `#BF8F00`
- Text: white, all caps (“START VOTING”)
- Border: thick ink border
- Shadow: hard offset bottom-right (ink)
- Corner radius: rounded rectangle, matching the PNG.

### After tally: Replace button with status chip
After votes are tallied:
- Replace the Start Voting button with a same-size chip:
  - Approved: green fill
  - Rejected: red fill
- Chip is clickable to reopen the results modal (roll call + outcome).
- Must NOT auto-pop open when revisiting the slide.

---

## Implementation Notes

- Match spacing/padding to the mock:
  - generous internal padding
  - clear separation between header and content area
  - consistent gutters between columns
- Keep current functionality intact:
  - proposal data binding
  - deep links
  - voting workflow
  - modals
  - slide navigation

---

## Definition of Done

- Proposal slide looks visually indistinguishable from `proposal-slide-with-voting.png` at normal desktop viewport sizes.
- Title is legible (ink), not washed out.
- DETAILS panel is blue with white text and readable spacing.
- Pros/Cons markers (`1|`) align correctly and stay on the same line as their text.
- Shadows are hard offset (bottom-right), not glowing outlines.
- Voting button matches gold style; after tally, button becomes a clickable status chip.
