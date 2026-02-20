import { NextResponse } from "next/server";
import { requireCommissioner } from "@/lib/session";
import { getSupabaseServer } from "@/lib/supabase-server";
import { Resend } from "resend";

export async function POST(req: Request) {
  await requireCommissioner();

  const { meeting_id, subject, html, markdown } = await req.json();
  const sb = getSupabaseServer();

  // Get owner emails
  const session = await (await import("@/lib/session")).getSession();
  const { data: owners } = await sb
    .from("owners")
    .select("email")
    .eq("league_id", session!.league_id)
    .not("email", "is", null);

  const emails = (owners || []).map((o) => o.email).filter(Boolean) as string[];

  // Save minutes
  await sb.from("meeting_minutes").upsert(
    {
      meeting_id,
      minutes_markdown: markdown,
      email_subject: subject,
      email_body_html: html,
    },
    { onConflict: "meeting_id" }
  );

  // Try to send email
  if (process.env.RESEND_API_KEY && emails.length > 0) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || "meetings@example.com";
    await resend.emails.send({
      from: fromEmail,
      to: emails,
      subject: subject || "Meeting Recap",
      html: html,
    });

    await sb
      .from("meeting_minutes")
      .update({ emailed_at: new Date().toISOString() })
      .eq("meeting_id", meeting_id);

    return NextResponse.json({ sent: true, recipients: emails.length });
  }

  return NextResponse.json({ sent: false, reason: "No RESEND_API_KEY or no emails configured" });
}
