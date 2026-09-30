import { NextResponse } from "next/server";
import { db, requireManager } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { actorId, telegramUserId, employeeId } = await request.json();
    const supabase = db();
    await requireManager(supabase, String(actorId ?? ""));
    const { data: contact, error: contactError } = await supabase.from("telegram_contacts").select("telegram_user_id,chat_id").eq("telegram_user_id", String(telegramUserId ?? "")).single();
    if (contactError || !contact) throw new Error("Ask that person to send /start to the bot first.");
    const { data: employee, error: employeeError } = await supabase.from("employees").select("id,name").eq("id", String(employeeId ?? "")).single();
    if (employeeError || !employee) throw new Error("Choose a valid employee.");

    // A single tester may be re-linked between Richard and Kevin for Test 1.
    const { error: clearError } = await supabase.from("employees").update({ telegram_user_id: null, telegram_chat_id: null }).eq("telegram_user_id", contact.telegram_user_id);
    if (clearError) throw new Error(clearError.message);
    const { error: staleContactError } = await supabase.from("telegram_contacts").update({ employee_id: null }).eq("employee_id", employee.id);
    if (staleContactError) throw new Error(staleContactError.message);
    const { error: linkError } = await supabase.from("employees").update({ telegram_user_id: contact.telegram_user_id, telegram_chat_id: contact.chat_id }).eq("id", employee.id);
    if (linkError) throw new Error(linkError.message);
    const { error: contactUpdateError } = await supabase.from("telegram_contacts").update({ employee_id: employee.id }).eq("telegram_user_id", contact.telegram_user_id);
    if (contactUpdateError) throw new Error(contactUpdateError.message);
    return NextResponse.json({ ok: true, message: `${employee.name} is now linked to Telegram user ${contact.telegram_user_id}.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not link the Telegram user." }, { status: 400 });
  }
}
