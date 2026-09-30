import type { SupabaseClient } from "@supabase/supabase-js";
import { validSplit, type CommissionSplit } from "@/lib/finance";
import { syncAndRecordTransaction } from "@/lib/transaction-sync";

type Input = Record<string, unknown>;

const saleProjects = new Set(["A", "B"]);
const expenseCategories = new Set(["Materials", "Travel", "Other"]);
const allocations = new Set(["A", "B", "Company overhead"]);

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function amount(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : NaN; }

export async function createTransaction(
  supabase: SupabaseClient,
  input: Input,
  submittedBy: string,
  source: "website" | "telegram",
  originatingChatId?: string | null,
  telegramUserId?: string | null
) {
  const transactionType = text(input.transactionType);
  if (transactionType !== "sale" && transactionType !== "expense") throw new Error("Choose either a sale or an expense.");
  const reference = text(input.reference).toUpperCase();
  const description = text(input.description);
  const transactionAmount = amount(input.amount);
  if (!reference || !description || !Number.isFinite(transactionAmount) || transactionAmount <= 0) throw new Error("Reference, description, and an amount above zero are required.");

  const { data: employee, error: employeeError } = await supabase.from("employees").select("id,name,role,telegram_chat_id").eq("id", submittedBy).single();
  if (employeeError || !employee) throw new Error("The selected employee is invalid.");

  const common = {
    reference,
    transaction_type: transactionType,
    submitted_by: submittedBy,
    description,
    amount: transactionAmount,
    submitted_via: source,
    originating_telegram_chat_id: originatingChatId ?? employee.telegram_chat_id ?? null,
    telegram_submission_user_id: telegramUserId ?? null,
    sync_status: "pending"
  };

  let payload: Record<string, unknown>;
  if (transactionType === "sale") {
    if (employee.role !== "salesperson") throw new Error("Only Richard, Anastasia, and Jean-Claude can submit sales.");
    const customer = text(input.customer);
    const project = text(input.project);
    const split: CommissionSplit = { richard: amount(input.richardPct), anastasia: amount(input.anastasiaPct), jeanClaude: amount(input.jeanPct) };
    if (!customer || !saleProjects.has(project)) throw new Error("A customer and project A or B are required for a sale.");
    if (!validSplit(split)) throw new Error("Commission shares must be between 0 and 100 and total exactly 100%.");
    payload = {
      ...common, customer, project,
      proposed_richard_pct: split.richard, proposed_anastasia_pct: split.anastasia, proposed_jean_claude_pct: split.jeanClaude,
      status: "pending_approval"
    };
  } else {
    if (employee.role !== "expense_reporter") throw new Error("Only Kevin von Whatever can submit expenses.");
    const category = text(input.category);
    const proposedAllocation = text(input.allocation);
    if (!expenseCategories.has(category) || !allocations.has(proposedAllocation)) throw new Error("Choose a valid expense category and proposed allocation.");
    const overhead = proposedAllocation === "Company overhead";
    payload = {
      ...common, category, proposed_allocation: proposedAllocation,
      final_allocation: overhead ? "Company overhead" : null,
      status: overhead ? "overhead" : "awaiting_allocation"
    };
  }

  const { data, error } = await supabase.from("transactions").insert(payload).select("*, employees!transactions_submitted_by_fkey(name)").single();
  if (error) throw new Error(error.code === "23505" ? "That reference already exists." : error.message);
  const sync = await syncAndRecordTransaction(supabase, data.id);
  return { transaction: data, sync };
}
