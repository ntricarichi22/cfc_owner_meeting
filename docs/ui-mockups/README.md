# UI Mockups (Source of Truth)

This folder contains the **authoritative visual specs** for the CFC Owners Meeting app UI.
When implementing or restyling UI, **match the PNGs in this folder first**. If code and mockups conflict, **the mockups win**.

---

## Mockups

- `proposal-slide-with-voting.png`  
  Final target for the **Proposal Slide Template** (includes the gold “START VOTING” button and the overall layout / typography / shadows).

- `admin-slide-option-b.png`  
  Final target for the **Admin Slide Template (Option B)** — same header band style as proposal slides, with one main content card framed by a blue mat.

---

## Non-Negotiables (Guardrails)

When implementing these designs:

- **Do not** change Supabase tables/columns, SQL, RLS policies, or API payload shapes.
- **Do not** change routes, navigation, meeting flow, or deep link behavior.
- **Do not** refactor meeting/voting/session hooks except to move styling wrappers.
- UI work should be **layout + styling only** for slide templates and their presentational components.

---

## Colors (Use exact hex values)

- Paper background: `#F6F0E6`
- Ink (borders + primary text): `#111111`
- Electric Blue: `#22A3FF`
- Accent Red (chips): `#FF3B30`
- Voting Gold (Start Voting button): `#BF8F00`

Voting results (status chip + badges):
- Approved Green: `#16A34A`
- Rejected Red: `#DC2626`

---

## Typography

Match the mockups: bold, condensed, “poster” feel for titles and headers.

- Slide Title: large, all caps, heavy weight, ink color.
- Section headers (“DETAILS”, “PROS”, “CONS”, “RECENT UPDATES”, etc.): all caps, bold, ink.
- Body text:
  - Proposal DETAILS panel: white text on blue background.
  - Proposal PROS/CONS: ink text on paper.
  - Admin slide main content: ink text on paper.

If a specific font is not available, choose the closest condensed display font already in the project and keep sizing/weights consistent.

---

## Borders, Shadows, and Card Style

This UI uses “paper + ink” styling with bold borders and **hard offset shadows**.

### Ink border
- Use a thick border like `4px solid #111111` (or closest match already in the project).

### Hard shadow (no blur)
- Default shadow: `8px 8px 0 #111111`
- No blur. No transparency.
- Shadow should appear primarily on the **bottom and right** (not as a glow/outline).

---

## Proposal Slide Template (Target)

Match `proposal-slide-with-voting.png`.

### Header band (top strip)
- Full width, paper background, ink border + hard shadow.
- Left: `PROPOSAL #X: {TITLE}`
- Under title: chips row:
  - `PROPOSED BY: <TEAM>`
  - `EFFECTIVE DATE: <YEAR> CLUB YEAR`
  - Constitution deep link chip(s), e.g. `ARTICLE 4, SECTION 1`
- Right: large gold **START VOTING** button.

### Content area (below header)
Two-column layout:
- Left 60%: blue DETAILS panel (`#22A3FF`) with white text and bullets.
- Right 40%: PROS and CONS stacked cards (paper background, ink text).

### “1|” formatting rules (Pros/Cons)
- `1|` must stay on the same line as its text.
- Render as a 2-column row (fixed marker column + flexible text column).
- Avoid weird mid-word wrapping.
- Normalize rich text HTML so NBSP (`&nbsp;` / `\u00A0`) does not break wrapping.

### Voting button / status chip
- Start Voting button:
  - Fill: `#BF8F00`
  - Text: white, all caps
  - Ink border + hard shadow
- After tally, replace with same-size status chip:
  - Approved: green fill
  - Rejected: red fill
  - Click reopens results modal
  - Must not auto-pop on slide revisit

---

## Admin Slide Template (Option B Target)

Match `admin-slide-option-b.png`.

### Header band (same system as proposal slides)
- Same title/chips styling as proposal slides (paper + ink).
- No voting button on admin slides.

### Main content area (one card)
- One large content card on paper background with ink border + hard shadow.
- The content card is framed by a **blue “mat”/frame**:
  - Blue fill `#22A3FF` behind/around the content card (as shown in mock).
  - The inner card remains paper for readability.

### Content inside the admin card
- Supports rich text and pasted tables (Excel/Sheets).
- Tables should remain readable:
  - borders visible
  - header row distinct
  - horizontal scroll allowed inside the card if needed
- Typography should match the mock (clear headings, comfortable spacing).

---

## Definition of Done

- Proposal slides visually match `proposal-slide-with-voting.png`.
- Admin slides visually match `admin-slide-option-b.png`.
- No schema/API changes.
- All existing meeting functionality remains intact.
