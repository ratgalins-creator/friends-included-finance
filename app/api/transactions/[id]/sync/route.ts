import { NextResponse } from "next/server";
import { db, requireManager } from "@/lib/supabase";
import { syncAndRecordTransaction } from "@/lib/transaction-sync";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actorId } = await request.json();
    const supabase = db();
    await requireManager(supabase, String(actorId ?? ""));
    const { id } = await params;
    const sync = await syncAndRecordTransaction(supabase, id);
    if (!sync.ok) throw new Error(sync.error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google Sheets retry failed." }, { status: 400 });
  }
}
