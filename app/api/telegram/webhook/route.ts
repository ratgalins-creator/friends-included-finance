import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { processTelegramUpdate } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "Invalid Telegram webhook secret." }, { status: 401 });
  try {
    await processTelegramUpdate(db(), await request.json());
  } catch (error) {
    // Telegram should not repeatedly redeliver a malformed update forever. The
    // meaningful failure is stored against a transaction when one exists.
    console.error("Telegram webhook processing failed", error);
  }
  return NextResponse.json({ ok: true });
}
