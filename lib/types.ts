export interface Meeting {
  id: string;
  year: number;
  title: string;
  status: "draft" | "live" | "finalized";
  locked: boolean;
  created_at: string;
  // Legacy fields for backward compatibility with existing pages
  league_id?: string;
  club_year?: number;
  meeting_date?: string | null;
  current_agenda_item_id?: string | null;
  finalized_at?: string | null;
}

export interface AgendaItem {
  id: string;
  meeting_id: string;
  order_index: number;
  category: string;
  title: string;
  created_at: string;
  // Legacy fields for backward compatibility with existing pages
  type?: string;
  section_id?: string;
  sort_order?: number;
  presenter_owner_id?: string;
  voting_required?: boolean;
  timer_duration_seconds?: number;
  timer_started_at?: string | null;
  timer_paused_at?: string | null;
  timer_remaining_seconds?: number | null;
  status?: string;
}

export interface Proposal {
  id: string;
  meeting_id: string;
  agenda_item_id: string | null;
  title: string;
  summary: string | null;
  effective_date: string | null;
  status: "draft" | "open" | "passed" | "failed" | "tabled";
  created_at: string;
  // Legacy fields for backward compatibility
  pros?: string | null;
  cons?: string | null;
}

export interface ProposalVersion {
  id: string;
  proposal_id: string;
  version_number: number;
  full_text: string;
  rationale: string | null;
  created_by_team: string | null;
  created_at: string;
  is_active: boolean;
  // Legacy fields for backward compatibility
  created_by_owner_id?: string | null;
  status?: string;
}

export interface Amendment {
  id: string;
  proposal_id: string;
  proposed_text: string;
  rationale: string | null;
  submitted_by_team: string | null;
  created_at: string;
  status: string;
  // Legacy fields for backward compatibility
  proposal_version_id?: string;
  suggested_text?: string;
  submitted_by_owner_id?: string | null;
}

export interface Vote {
  id: string;
  proposal_version_id: string;
  team_id: string;
  team_name: string;
  vote: "yes" | "no";
  created_at: string;
  // Legacy fields for backward compatibility
  owner_id?: string;
  choice?: "yes" | "no";
  updated_at?: string;
}

export interface ConstitutionSection {
  id: string;
  section_key: string;
  title: string;
  body: string;
  updated_at: string;
  // Legacy fields for backward compatibility with existing pages
  article_id?: string;
  section_num?: string;
  section_title?: string;
  anchor?: string;
  sort_order?: number;
}

// Legacy type stubs for pages that still import them
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

export interface AgendaSection {
  id: string;
  meeting_id: string;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface ConstitutionArticle {
  id: string;
  league_id: string;
  club_year: number;
  article_num: string;
  article_title: string;
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
