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

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { proposalId, suggestedText, rationale } = body as {
    proposalId?: string;
    suggestedText?: string;
    rationale?: string;
  };

  if (!proposalId || !suggestedText?.trim()) {
    return NextResponse.json(
      { error: "proposalId is required and suggestedText cannot be empty" },
      { status: 400 }
    );
  }

  try {
    await submitAmendment(proposalId, suggestedText, rationale);
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

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { amendmentId, action } = body as {
    amendmentId?: string;
    action?: string;
  };

  if (!amendmentId || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: "amendmentId and action are required" }, { status: 400 });
  }

  try {
    if (action === "accept") {
      await promoteAmendment(amendmentId);
    } else {
      await rejectAmendment(amendmentId);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update amendment" },
      { status: 500 }
    );
  }
}
