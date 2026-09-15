import { NextRequest, NextResponse } from "next/server";
import { recordClientEvent } from "@/lib/tracking";

const clientEvents = new Set([
  "read_start",
  "read_25",
  "read_50",
  "read_75",
  "read_90",
  "read_complete",
  "engagement_heartbeat",
  "page_jump",
  "reader_error",
]);

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 16_384) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }

    const payload: unknown = await request.json();
    if (!isClientEvent(payload)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await recordClientEvent(payload).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

function isClientEvent(value: unknown): value is Record<string, unknown> & {
  event: string;
} {
  if (!value || typeof value !== "object") return false;
  const event = (value as Record<string, unknown>).event;
  return typeof event === "string" && clientEvents.has(event);
}
