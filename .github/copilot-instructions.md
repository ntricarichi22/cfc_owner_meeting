# GitHub Copilot Instructions

## Project Overview

This is the **CFC Owners Meeting App** — a Next.js web application for running annual dynasty fantasy football league Owners Meetings. It replaces manual PowerPoint, vote tracking, minutes, and email workflows with a live meeting app.

## Tech Stack

- **Framework**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS v4 (dark theme throughout)
- **Database**: Supabase (Postgres + optional Realtime)
- **Email**: Resend (optional)
- **Rich Text**: react-quill-new
- **Auth**: Cookie-based identity (HMAC-signed, no login required)

## Project Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — Shared React components
- `lib/` — Shared utilities, types, server actions, and Supabase clients
  - `lib/types.ts` — All TypeScript interfaces and shared constants
  - `lib/constants.ts` — App-wide constants (e.g., `COMMISSIONER_TEAM_NAME`)
  - `lib/actions.ts` — Next.js Server Actions
  - `lib/session.ts` — Cookie-based session handling (HMAC signing)
  - `lib/supabase-server.ts` — Supabase client for server components/actions
  - `lib/supabase-browser.ts` — Supabase client for browser/client components
  - `lib/api.ts` — Data fetching helpers
  - `lib/voting.ts` — Voting logic helpers
- `db/` — SQL migration and seed files
- `supabase/` — Supabase-specific SQL schemas
- `docs/` — UI mockups and documentation

## Domain Concepts

- **League**: A dynasty fantasy football league with 12 owners
- **Commissioner**: The owner with `role = 'commissioner'` (team: "Virginia Founders") who manages meetings
- **Meeting**: An annual owners meeting with status `draft | live | finalized`
- **Agenda Item**: An ordered item within a meeting, belonging to a category
- **Proposal**: A rule-change proposal tied to an agenda item, with status `draft | open | passed | failed | tabled`
- **Proposal Version**: A versioned snapshot of a proposal's full text (e.g., after an amendment is promoted)
- **Amendment**: A suggested change to a proposal, submitted by any owner
- **Vote**: A YES or NO vote cast by an owner on a specific proposal version (8/12 required to pass)
- **Constitution Section**: A section of the league constitution, editable by the commissioner

## Coding Conventions

- Use TypeScript with strict types; all interfaces live in `lib/types.ts`
- Use Next.js Server Actions (`"use server"`) for mutations; avoid raw API routes for mutations
- Use `lib/supabase-server.ts` in Server Components and Server Actions; use `lib/supabase-browser.ts` in Client Components
- Tailwind CSS utility classes only — no CSS modules or inline styles
- Dark theme by default; use `bg-gray-900`, `bg-gray-800`, `text-white`, `text-gray-300` etc.
- All pages use the shared `<Nav />` component from `components/Nav.tsx`
- Session identity is stored in a signed HMAC cookie containing `owner_id`, `team_name`, `role`, `league_id`
- Gate commissioner-only actions by checking `session.role === 'commissioner'`

## Key Business Rules

- Only YES or NO votes (no abstain)
- **8 out of 12** YES votes required for a proposal to pass (2/3 threshold)
- Votes are NOT anonymous — visible after tally
- Voting is tracked per `proposal_version_id`, not per proposal
- The commissioner opens and closes voting; owners cannot vote outside of open windows
- Timer increments/decrements in 10-minute (600 second) steps
- Meeting must be `live` for owners to vote; must be finalized before recap email can be sent
