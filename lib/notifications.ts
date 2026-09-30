import type { SupabaseClient } from "@supabase/supabase-js";
import { commissions, type CommissionSplit } from "@/lib/finance";
import { sendTelegramMessage } from "@/lib/telegram-api";

export type NotificationKind = "submission_confirmation" | "manager_submission_alert" | "decision";

type TransactionForMessage = {
  id: string;
  reference: string;
  transaction_type: "sale" | "expense";
  amount: number | string;
  project: string | null;
  description: string;
  proposed_allocation: string | null;
  final_allocation: string | null;
  proposed_richard_pct: number | string | null;
  proposed_anastasia_pct: number | string | null;
  proposed_jean_claude_pct: number | string | null;
  approved_richard_pct: number | string | null;
  approved_anastasia_pct: number | string | null;
  approved_jean_claude_pct: number | string | null;
  employees: { name: string } | null;
};

const euro = (value: number) => `€${(value / 100).toFixed(2)}`;
const percent = (value: number | string | null) => Number(value ?? 0);

export function submissionMessage(transaction: TransactionForMessage) {
  if (transaction.transaction_type === "sale") {
    return `${transaction.reference} recorded. Sale ${euro(Math.round(Number(transaction.amount) * 100))}; Project ${transaction.project}; status: Pending approval. Proposed split: Richard ${percent(transaction.proposed_richard_pct)}%, Anastasia ${percent(transaction.proposed_anastasia_pct)}%, Jean-Claude ${percent(transaction.proposed_jean_claude_pct)}%.`;
  }
  const allocation = transaction.proposed_allocation ?? "not set";
  const status = allocation === "Company overhead" ? "Company overhead (allocated automatically)" : "Awaiting allocation";
  return `${transaction.reference} recorded. Expense ${euro(Math.round(Number(transaction.amount) * 100))}; proposed: ${allocation}; status: ${status}.`;
}

export function managerAlertMessage(transaction: TransactionForMessage) {
  return `${transaction.reference} is ready for review: ${transaction.transaction_type} ${euro(Math.round(Number(transaction.amount) * 100))} from ${transaction.employees?.name ?? "an employee"}. Review it in the Friends Included finance dashboard.`;
}

export function decisionMessage(transaction: TransactionForMessage) {
  if (transaction.transaction_type === "expense") {
    const changed = transaction.proposed_allocation !== transaction.final_allocation;
    return `${transaction.reference} — allocation ${changed ? "changed" : "confirmed"}. ${euro(Math.round(Number(transaction.amount) * 100))}: ${transaction.description}. Proposed: ${transaction.proposed_allocation}. Final: ${transaction.final_allocation}.`;
  }
  const proposed: CommissionSplit = {
    richard: percent(transaction.proposed_richard_pct),
    anastasia: percent(transaction.proposed_anastasia_pct),
    jeanClaude: percent(transaction.proposed_jean_claude_pct)
  };
  const approved: CommissionSplit = {
    richard: percent(transaction.approved_richard_pct),
    anastasia: percent(transaction.approved_anastasia_pct),
    jeanClaude: percent(transaction.approved_jean_claude_pct)
  };
  const changed = proposed.richard !== approved.richard || proposed.anastasia !== approved.anastasia || proposed.jeanClaude !== approved.jeanClaude;
  const earned = commissions(transaction.amount, approved);
  return `${transaction.reference} approved — commission split ${changed ? "changed" : "confirmed"}. Sale ${euro(Math.round(Number(transaction.amount) * 100))}; total commission ${euro(earned.pool)}. Richard: ${proposed.richard}% → ${approved.richard}% (${euro(earned.richard)}). Anastasia: ${proposed.anastasia}% → ${approved.anastasia}% (${euro(earned.anastasia)}). Jean-Claude: ${proposed.jeanClaude}% → ${approved.jeanClaude}% (${euro(earned.jeanClaude)}).`;
}

export async function recordAndSendNotification(
  supabase: SupabaseClient,
  transactionId: string,
  kind: NotificationKind,
  chatId: string | null | undefined,
  message: string
) {
  const now = new Date().toISOString();
  if (!chatId) {
    await supabase.from("transaction_notifications").upsert({
      transaction_id: transactionId, kind, chat_id: null, message, status: "not_required", error: "No Telegram recipient linked", updated_at: now
    }, { onConflict: "transaction_id,kind" });
    return { ok: true, status: "not_required" };
  }

  const { data: previous } = await supabase.from("transaction_notifications").select("attempts").eq("transaction_id", transactionId).eq("kind", kind).maybeSingle();
  await supabase.from("transaction_notifications").upsert({
    transaction_id: transactionId, kind, chat_id: chatId, message, status: "pending", error: null,
    attempts: Number(previous?.attempts ?? 0) + 1, updated_at: now
  }, { onConflict: "transaction_id,kind" });

  try {
    await sendTelegramMessage(chatId, message);
    await supabase.from("transaction_notifications").update({ status: "sent", error: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("transaction_id", transactionId).eq("kind", kind);
    return { ok: true, status: "sent" };
  } catch (error) {
    const messageError = error instanceof Error ? error.message : "Telegram delivery failed.";
    await supabase.from("transaction_notifications").update({ status: "failed", error: messageError, updated_at: new Date().toISOString() }).eq("transaction_id", transactionId).eq("kind", kind);
    return { ok: false, status: "failed", error: messageError };
  }
}

export async function notifyManagerOfSubmission(supabase: SupabaseClient, transaction: TransactionForMessage) {
  const { data: manager } = await supabase.from("employees").select("telegram_chat_id").eq("role", "manager").maybeSingle();
  return recordAndSendNotification(supabase, transaction.id, "manager_submission_alert", manager?.telegram_chat_id, managerAlertMessage(transaction));
}
