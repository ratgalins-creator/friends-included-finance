import { NextResponse } from "next/server";
import { telegramCall } from "@/lib/telegram-api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const bot = await telegramCall<{ username?: string }>("getMe", {});
    return NextResponse.json({ botUrl: bot.username ? `https://t.me/${bot.username}` : null });
  } catch {
    return NextResponse.json({ botUrl: null });
  }
}
