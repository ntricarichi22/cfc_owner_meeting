export interface League {
  id: string;
  name: string;
  created_at: string;
}

export interface Owner {
  id: string;
  league_id: string;
  display_name: string;
  email: string | null;
  team_name: string;
  role: "commissioner" | "owner";
  created_at: string;
}

export interface Meeting {
  id: string;
  league_id: string;
  club_year: number;
  meeting_date: string | null;
  status: "draft" | "live" | "finalized";
  current_agenda_item_id: string | null;
  created_at: string;
  finalized_at: string | null;
}

export interface AgendaSection {
  id: string;
  meeting_id: string;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface AgendaItem {
  id: string;
  meeting_id: string;
  section_id: string | null;
  type: "proposal" | "admin";
  title: string;
  presenter_owner_id: string | null;
  sort_order: number;
  voting_required: boolean;
  timer_duration_seconds: number | null;
  timer_started_at: string | null;
  timer_paused_at: string | null;
  timer_remaining_seconds: number | null;
  status: "not_started" | "in_discussion" | "voting_open" | "voting_closed" | "tallied" | "finalized";
  created_at: string;
}

export interface Proposal {
  id: string;
  agenda_item_id: string;
  summary: string | null;
  pros: string | null;
  cons: string | null;
  effective_date: string | null;
  created_at: string;
}

export interface ProposalVersion {
  id: string;
  proposal_id: string;
  version_number: number;
  full_text: string;
  created_by_owner_id: string | null;
  status: "draft" | "active" | "superseded" | "final";
  created_at: string;
}

export interface Amendment {
  id: string;
  proposal_version_id: string;
  suggested_text: string;
  rationale: string | null;
  submitted_by_owner_id: string | null;
  status: string;
  created_at: string;
}

export interface Vote {
  id: string;
  proposal_version_id: string;
  owner_id: string;
  choice: "yes" | "no";
  created_at: string;
  updated_at: string;
}

export interface ConstitutionArticle {
  id: string;
  league_id: string;
  club_year: number;
  article_num: string;
  article_title: string;
  sort_order: number;
}

export interface ConstitutionSection {
  id: string;
  article_id: string;
  section_num: string;
  section_title: string;
  body: string;
  anchor: string;
  sort_order: number;
}

export interface MeetingMinutes {
  id: string;
  meeting_id: string;
  minutes_markdown: string;
  email_subject: string | null;
  email_body_html: string | null;
  emailed_at: string | null;
}

export const VOTE_THRESHOLD = 8;
export const TOTAL_OWNERS = 12;
export const DEFAULT_TIMER_SECONDS = 600; // 10 minutes
export const TIMER_INCREMENT_SECONDS = 600; // 10 minutes
