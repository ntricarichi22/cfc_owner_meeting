import { NextResponse } from "next/server";
import { requireCommissioner } from "@/lib/session";

export async function POST() {
  await requireCommissioner();
  // owners and meeting_minutes tables do not exist in the MVP schema
  return NextResponse.json({ sent: false, reason: "Email feature not available in MVP schema" });
}
