type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("Telegram bot token is not configured.");
  return value;
}

export async function telegramCall<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const data = await response.json() as TelegramResponse<T>;
  if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram ${method} failed.`);
  return data.result as T;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  return telegramCall("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}
