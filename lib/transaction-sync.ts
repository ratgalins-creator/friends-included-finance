import type { SupabaseClient } from "@supabase/supabase-js";
import { syncTransactionToGoogleSheets } from "./google-sheets";

export async function syncAndRecordTransaction(supabase: SupabaseClient, transactionId: string) {
  const { data: transaction, error: readError } = await supabase
    .from("transactions")
    .select("*, employees(name)")
    .eq("id", transactionId)
    .single();
  if (readError || !transaction) return { ok: false, error: readError?.message ?? "Transaction was not found." };

  try {
    await syncTransactionToGoogleSheets(transaction);
    const { error } = await supabase.from("transactions").update({ sync_status: "synced", sync_error: null }).eq("id", transactionId);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
    await supabase.from("transactions").update({ sync_status: "failed", sync_error: message }).eq("id", transactionId);
    return { ok: false, error: message };
  }
}
