# UI Mockups (Source of Truth)

This folder contains the **authoritative visual specs** for the CFC Owners Meeting app UI.
When implementing or restyling UI, **match the PNGs in this folder first**. If code and mockups conflict, **the mockups win**.

---

## Mockups (Source of Truth)

- `proposal-slide-with-voting.png`  
  Final target for the **Proposal Slide Template**.

- `admin-slide-option-b.png`  
  Final target for the **Admin Slide Template (Option B)**.

- `welcome-screen-with-dropdown.png`  
  Final target for the **Welcome / Team Select page**.

- `title-slide.png`  
  Final target for the **Title Slide** shown first inside the meeting carousel.

- `meeting-minutes-UI.png`  
  Final target for the **Minutes Review page**.

---

## Non-Negotiables (Guardrails)

When implementing these designs:

- **Do not** change Supabase tables/columns, SQL, RLS policies, or API payload shapes unless explicitly required and first confirmed against the existing code/schema.
- **Do not** change routes, navigation, meeting flow, or deep link behavior except where explicitly required by the minutes flow.
- **Do not** refactor meeting/voting/session hooks except to move styling wrappers.
- UI work should be **layout + styling only** unless a feature is explicitly part of the minutes workflow.
- Before coding, inspect the current schema/types/routes and use only **existing** tables/columns/endpoints where possible.

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

## Borders + Shadows

- Thick ink border: ~`4px solid #111111`
- Hard offset shadow (no blur): `8px 8px 0 #111111`
- Shadows should read **bottom-right**, not glow/outline.

---

## Welcome Screen

Match `welcome-screen-with-dropdown.png`:
- Full-screen neo-brutal poster layout
- Big welcome title
- Team dropdown
- Large “Enter Meeting” button
- Existing login/session behavior must remain unchanged

---

## Title Slide

Match `title-slide.png`:
- Full-screen split-block composition
- Left side: “2026 CFC Owners Meeting”
- Date: “March 1, 2026”
- Right side: blue block with subtle CFC mark
- This is the first slide in the meeting carousel

---

## Proposal Slide

Match `proposal-slide-with-voting.png`:
- Existing proposal header + chips + Start Voting / status chip
- 60/40 body layout
- Blue Details panel left
- Pros/Cons stacked on the right
- Existing deep links + voting behavior must remain unchanged

---

## Admin Slide

Match `admin-slide-option-b.png`:
- Same header system as proposal slides
- One large paper content card framed by a blue mat
- Supports rich text + pasted tables
- Merged cells from tables must be preserved

---

## Minutes Review Page

Match `meeting-minutes-UI.png`.

### Workflow
- Commissioner clicks **End Meeting** on the current meeting screen
- Modal opens and requires transcript upload
- After transcript upload, commissioner confirms
- Meeting is locked/frozen and routes to the Minutes Review page

### Minutes Review page structure
- Left full-height sidebar listing slides in order
  - proposal/admin title
  - badge: Approved / Rejected / Admin
- Right pane updates based on selected slide
- Top header includes:
  - meeting title/date
  - Draft Minutes badge
  - Finalize Minutes button
- Main pane for selected slide shows:
  - votes for / votes against chips
  - hover/click behavior to reveal who voted each way
  - AI-generated discussion summary
  - confidence score
  - link to transcript excerpt
  - commissioner notes

### End Meeting behavior
- Locks meeting results
- Prevents vote reopening / editing
- Generates draft minutes context
- Routes to Minutes Review page

---

## Definition of Done

- Welcome screen matches `welcome-screen-with-dropdown.png`
- Title slide matches `title-slide.png`
- Proposal slide matches `proposal-slide-with-voting.png`
- Admin slide matches `admin-slide-option-b.png`
- Minutes Review page matches `meeting-minutes-UI.png`
- No regressions to meeting flow, voting, constitution deep links, or builder flow
- No avoidable Supabase/API mismatches
