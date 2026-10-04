import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { createTransaction } from "@/lib/transactions";
import { notifyManagerOfSubmission } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A public coursework role selector is not authentication. Resolve its actor
// from the database and enforce that selected role's read scope on the server.
const ownTransactionColumns = [
  "id", "reference", "transaction_type", "submitted_by", "submitted_at",
  "description", "amount", "customer", "project", "category",
  "proposed_allocation", "final_allocation", "status", "manager_note",
  "proposed_richard_pct", "proposed_anastasia_pct", "proposed_jean_claude_pct",
  "approved_richard_pct", "approved_anastasia_pct", "approved_jean_claude_pct",
  "sync_status", "sync_error", "submitted_via",
  "employees!transactions_submitted_by_fkey(name)",
  "transaction_notifications(id,kind,status,error)"
].join(",");

function readResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" }
  });
}

export async function GET(request: Request) {
  try {
    const supabase = db();
    const { data: employees, error: employeeError } = await supabase
      .from("employees").select("id,name,role").order("name");
    if (employeeError) throw new Error(employeeError.message);

    const actorId = new URL(request.url).searchParams.get("actorId")?.trim();
    // The initial page load only needs the non-sensitive demonstration roster.
    if (!actorId) return readResponse({ employees: employees ?? [], transactions: [], contacts: [] });

    const actor = employees?.find((employee) => employee.id === actorId);
    if (!actor || !["manager", "salesperson", "expense_reporter"].includes(actor.role)) {
      return readResponse({ error: "Choose a valid demonstration employee." }, 403);
    }

    const manager = actor.role === "manager";
    const transactionQuery = supabase.from("transactions")
      .select(manager ? "*, employees!transactions_submitted_by_fkey(name), transaction_notifications(*)" : ownTransactionColumns)
      .order("submitted_at", { ascending: false });
    const scopedQuery = manager ? transactionQuery : transactionQuery.eq("submitted_by", actor.id);

    const [{ data: transactions, error: transactionError }, { data: contacts, error: contactError }] = await Promise.all([
      scopedQuery,
      manager
        ? supabase.from("telegram_contacts").select("*").order("last_seen_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);
    if (transactionError || contactError) throw new Error(transactionError?.message ?? contactError?.message);

    return readResponse({ employees: employees ?? [], transactions: transactions ?? [], contacts: contacts ?? [] });
  } catch (error) {
    return readResponse({ error: error instanceof Error ? error.message : "Could not load finance data." }, 500);
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

