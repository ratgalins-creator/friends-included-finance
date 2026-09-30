import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { createTransaction } from "@/lib/transactions";
import { notifyManagerOfSubmission } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = db();
    const [{ data: employees, error: employeeError }, { data: transactions, error: transactionError }, { data: contacts, error: contactError }] = await Promise.all([
      supabase.from("employees").select("id,name,role,telegram_user_id,telegram_chat_id").order("name"),
      supabase.from("transactions").select("*, employees!transactions_submitted_by_fkey(name), transaction_notifications(*)").order("submitted_at", { ascending: false }),
      supabase.from("telegram_contacts").select("*").order("last_seen_at", { ascending: false })
    ]);
    if (employeeError || transactionError || contactError) throw new Error(employeeError?.message ?? transactionError?.message ?? contactError?.message);
    return NextResponse.json({ employees, transactions, contacts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load finance data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const supabase = db();
    const created = await createTransaction(supabase, input, String(input.submittedBy ?? ""), "website");
    await notifyManagerOfSubmission(supabase, created.transaction);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save transaction." }, { status: 400 });
  }
}
