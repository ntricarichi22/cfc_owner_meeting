import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getAmendments,
  promoteAmendment,
  rejectAmendment,
  submitAmendment,
} from "@/lib/actions";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposalId = req.nextUrl.searchParams.get("proposalId");
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId query parameter is required" }, { status: 400 });
  }

  try {
    const data = await getAmendments(proposalId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch amendments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    proposalId?: string;
    suggestedText?: string;
    rationale?: string;
  } | null;

  if (!body?.proposalId || !body?.suggestedText?.trim()) {
    return NextResponse.json({ error: "proposalId and suggestedText are required" }, { status: 400 });
  }

  try {
    await submitAmendment(body.proposalId, body.suggestedText, body.rationale);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to submit amendment" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "commissioner") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    amendmentId?: string;
    action?: "accept" | "reject";
  } | null;

  if (!body?.amendmentId || !body?.action) {
    return NextResponse.json({ error: "amendmentId and action are required" }, { status: 400 });
  }

  try {
    if (body.action === "accept") {
      await promoteAmendment(body.amendmentId);
    } else if (body.action === "reject") {
      await rejectAmendment(body.amendmentId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update amendment" },
      { status: 500 }
    );
  }
}
