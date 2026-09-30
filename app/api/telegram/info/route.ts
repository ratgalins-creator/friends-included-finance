import { NextResponse } from "next/server";
import { telegramCall } from "@/lib/telegram-api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const bot = await telegramCall<{ username?: string }>("getMe", {});
    const webhook = await telegramCall<{
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      allowed_updates?: string[];
    }>("getWebhookInfo", {});

    return NextResponse.json({
      botUrl: bot.username ? `https://t.me/${bot.username}` : null,
      webhook
    });
  } catch (error) {
    return NextResponse.json({
      botUrl: null,
      error: error instanceof Error
        ? error.message
        : "Could not read Telegram webhook status."
    });
  }
}
