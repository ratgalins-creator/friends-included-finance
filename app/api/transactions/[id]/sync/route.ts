import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncAndRecordTransaction } from "@/lib/transaction-sync";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase environment variables are not configured.");
    const { id } = await params;
    const sync = await syncAndRecordTransaction(createClient(url, key), id);
    if (!sync.ok) throw new Error(sync.error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets retry failed." }, { status: 400 });
  }
}
