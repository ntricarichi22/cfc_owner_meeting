# CFC Owners Meeting App

A Next.js application for running annual dynasty league Owners Meetings. Replaces manual PowerPoint, vote tracking, minutes, and email workflows with a live meeting app.

## Features

- **Team-based Identity**: Select your team from a dropdown — no login required
- **Commissioner Controls**: One designated commissioner manages meetings, agenda, voting, and finalization
- **Live Meeting Mode**: Present mode with timer, agenda navigation, real-time voting
- **Voting System**: YES/NO voting with 8/12 (2/3) threshold, tracked per proposal version
- **Amendments**: Any owner can propose amendments; commissioner can promote to new versions
- **Constitution Reference**: In-app constitution browser with deep links
- **History**: Browse past meetings, proposals, vote breakdowns
- **Post-Meeting Recap**: Auto-generated minutes + email preview/send

## Setup

### 1. Environment Variables

Set these in your `.env.local` file and in Vercel:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TEAM_SESSION_SECRET=a-random-32-char-secret-for-cookie-signing

# Optional
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=meetings@yourdomain.com
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
```

### 2. Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** in Supabase Dashboard
3. Run `db/init.sql` to create all tables, indexes, and triggers
4. Run `db/seed.sql` to create initial league, 12 owners, and a meeting year
5. (Optional) Enable Realtime for live sync:
   ```sql
   alter publication supabase_realtime add table meetings;
   alter publication supabase_realtime add table agenda_items;
   alter publication supabase_realtime add table votes;
   alter publication supabase_realtime add table amendments;
   ```

### 3. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### 4. Deploy to Vercel

Set env vars in Vercel dashboard and deploy. The app works immediately once env vars are set and the database schema is applied.

## App Routes

| Route | Description |
|-------|-------------|
| `/` | Home — Team selector + meeting list |
| `/meeting/[year]` | Live meeting dashboard with present mode |
| `/admin` | Commissioner-only admin hub |
| `/constitution` | Constitution browser |
| `/constitution/[anchor]` | Constitution section detail |
| `/history` | Past meetings list |
| `/history/[year]` | Past meeting detail with vote breakdown |

## Identity System

- Users select their team from a dropdown (populated from the `owners` table)
- On selection, a signed HMAC cookie is set containing `owner_id`, `team_name`, `role`, `league_id`
- Server actions and API routes verify the cookie for authorization
- The commissioner is the owner with `role = 'commissioner'` (team: "Virginia Founders")

## Commissioner Capabilities

- Create/manage meetings, agenda sections, agenda items, proposals
- Control live meeting flow (set current item, navigate)
- Manage timer (start/pause/reset/extend by 10 min)
- Open voting, tally votes (requires all 12 owners)
- Promote amendments to new proposal versions
- Edit constitution articles and sections
- Finalize meeting and generate/send recap email

## Voting Rules

- YES or NO only (no abstain)
- Votes are NOT anonymous — visible after tally
- 8 YES votes required to pass (2/3 of 12)
- Voting tracked per proposal version
- Commissioner opens voting → owners vote → commissioner tallies → results locked

## Tech Stack

- **Next.js** (App Router, TypeScript)
- **Tailwind CSS** (dark theme)
- **Supabase** (Postgres + optional Realtime)
- **Resend** (optional email sending)
