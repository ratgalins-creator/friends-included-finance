import { NextResponse } from "next/server";
import { validSplit, type CommissionSplit } from "@/lib/finance";
import { decisionMessage, recordAndSendNotification } from "@/lib/notifications";
import { db, requireManager } from "@/lib/supabase";
import { syncAndRecordTransaction } from "@/lib/transaction-sync";

const allocations = new Set(["A", "B", "Company overhead"]);
const asNumber = (value: unknown) => Number(value);

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json();
    const supabase = db();
    const manager = await requireManager(supabase, String(input.actorId ?? ""));
    const { id } = await params;
    const { data: record, error: findError } = await supabase.from("transactions").select("*, employees!transactions_submitted_by_fkey(name)").eq("id", id).single();
    if (findError || !record) throw new Error("Transaction not found.");
    if (!["pending_approval", "awaiting_allocation"].includes(record.status)) return NextResponse.json({ ok: true, alreadyDecided: true, transaction: record });

    let update: Record<string, unknown>;
    if (record.transaction_type === "sale") {
      const split: CommissionSplit = {
        richard: input.richardPct === undefined ? Number(record.proposed_richard_pct) : asNumber(input.richardPct),
        anastasia: input.anastasiaPct === undefined ? Number(record.proposed_anastasia_pct) : asNumber(input.anastasiaPct),
        jeanClaude: input.jeanPct === undefined ? Number(record.proposed_jean_claude_pct) : asNumber(input.jeanPct)
      };
      if (!validSplit(split)) throw new Error("Final commission shares must be between 0 and 100 and total exactly 100%.");
      update = {
        status: "approved", approved_richard_pct: split.richard, approved_anastasia_pct: split.anastasia,
        approved_jean_claude_pct: split.jeanClaude, manager_note: typeof input.note === "string" ? input.note.trim() || null : null,
        manager_decided_by: manager.id, manager_decided_at: new Date().toISOString()
      };
    } else {
      const finalAllocation = typeof input.finalAllocation === "string" ? input.finalAllocation : record.proposed_allocation;
      if (!allocations.has(finalAllocation)) throw new Error("Choose A, B, or Company overhead as the final allocation.");
      update = {
        status: "approved", final_allocation: finalAllocation, manager_note: typeof input.note === "string" ? input.note.trim() || null : null,
        manager_decided_by: manager.id, manager_decided_at: new Date().toISOString()
      };
    }

    const { data: updated, error: updateError } = await supabase.from("transactions").update(update).eq("id", id).select("*, employees!transactions_submitted_by_fkey(name)").single();
    if (updateError || !updated) throw new Error(updateError?.message ?? "Could not save the manager decision.");
    const sync = await syncAndRecordTransaction(supabase, id);
    const notification = await recordAndSendNotification(supabase, id, "decision", updated.originating_telegram_chat_id, decisionMessage(updated));
    return NextResponse.json({ ok: true, transaction: updated, sync, notification });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not approve transaction." }, { status: 400 });
  }
}
