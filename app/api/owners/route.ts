import { NextResponse } from "next/server";

export async function GET() {
  // owners table does not exist in the MVP schema
  return NextResponse.json([]);
}
