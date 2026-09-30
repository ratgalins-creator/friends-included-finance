import { NextRequest, NextResponse } from "next/server";
import { db, requireManager } from "@/lib/supabase";
import { telegramCall } from "@/lib/telegram-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { actorId } = await request.json();
    const supabase = db();
    await requireManager(supabase, actorId);
    const webhookUrl = new URL("/api/telegram/webhook", request.url).toString();
    const body: Record<string, unknown> = { url: webhookUrl, allowed_updates: ["message"] };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) body.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    await telegramCall<boolean>("setWebhook", body);
    const bot = await telegramCall<{ username?: string }>("getMe", {});
    return NextResponse.json({ ok: true, webhookUrl, botUrl: bot.username ? `https://t.me/${bot.username}` : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not connect the Telegram bot." }, { status: 400 });
  }
}
