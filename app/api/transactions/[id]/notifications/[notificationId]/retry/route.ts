import { NextResponse } from "next/server";
import { recordAndSendNotification } from "@/lib/notifications";
import { db, requireManager } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; notificationId: string }> }) {
  try {
    const { actorId } = await request.json();
    const supabase = db();
    await requireManager(supabase, String(actorId ?? ""));
    const { id, notificationId } = await params;
    const { data: notification, error } = await supabase.from("transaction_notifications").select("id,kind,chat_id,message").eq("id", notificationId).eq("transaction_id", id).single();
    if (error || !notification) throw new Error("Telegram notification not found.");
    const result = await recordAndSendNotification(supabase, id, notification.kind, notification.chat_id, notification.message);
    if (!result.ok) throw new Error(result.error ?? "Telegram retry failed.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not retry Telegram delivery." }, { status: 400 });
  }
}
