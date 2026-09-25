import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      configured: Boolean(process.env.IMAGE_API_BASE_URL?.trim() && process.env.IMAGE_API_KEY?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
