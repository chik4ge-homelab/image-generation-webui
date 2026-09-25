import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      model: process.env.IMAGE_MODEL?.trim() || "gpt-image-1",
      configured: Boolean(process.env.IMAGE_API_BASE_URL?.trim() && process.env.IMAGE_API_KEY?.trim()),
      accessConfigured: Boolean(process.env.APP_ACCESS_TOKEN?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
