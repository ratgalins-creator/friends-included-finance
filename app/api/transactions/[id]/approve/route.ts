import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase environment variables are not configured.");
    const supabase = createClient(url, key); const { id } = await params;
    const { data: record, error: findError } = await supabase.from("transactions").select("*").eq("id", id).single();
    if (findError || !record) throw new Error("Transaction not found.");
    if (!["pending_approval", "awaiting_allocation"].includes(record.status)) throw new Error("This transaction has already been decided.");
    const update = record.transaction_type === "sale" ? { status: "approved", approved_richard_pct: record.proposed_richard_pct, approved_anastasia_pct: record.proposed_anastasia_pct, approved_jean_claude_pct: record.proposed_jean_claude_pct } : { status: "approved", final_allocation: record.proposed_allocation };
    const { error } = await supabase.from("transactions").update(update).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not approve transaction." }, { status: 400 }); }
}
