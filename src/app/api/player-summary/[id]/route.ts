import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(
    `https://fantasy.premierleague.com/api/element-summary/${id}/`
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch player summary" },
      { status: res.status }
    );
  }
  const data = await res.json();
  return NextResponse.json(data);
}
