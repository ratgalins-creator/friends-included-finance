import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = db();
    const [{ data: employees, error: employeeError }, { data: transactions, error: transactionError }] = await Promise.all([
      supabase.from("employees").select("id,name,role").order("name"),
      supabase.from("transactions").select("*, employees(name)").order("submitted_at", { ascending: false })
    ]);
    if (employeeError || transactionError) throw new Error(employeeError?.message ?? transactionError?.message);
    return NextResponse.json({ employees, transactions });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const amount = Number(input.amount);
    if (!input.reference || !input.submittedBy || !input.description || !Number.isFinite(amount) || amount <= 0) throw new Error("Reference, submitter, description, and an amount above zero are required.");
    const sale = input.transactionType === "sale";
    const richard = Number(input.richardPct), anastasia = Number(input.anastasiaPct), jean = Number(input.jeanPct);
    if (sale && (![richard, anastasia, jean].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) || richard + anastasia + jean !== 100)) throw new Error("Commission shares must be between 0 and 100 and total exactly 100%.");
    const supabase = db();
    const { data: employee, error: roleError } = await supabase.from("employees").select("role").eq("id", input.submittedBy).single();
    if (roleError || !employee) throw new Error("The selected employee is invalid.");
    if (sale && employee.role !== "salesperson") throw new Error("Only salespeople can submit sales.");
    if (!sale && employee.role !== "expense_reporter") throw new Error("Only Kevin can submit expenses.");
    const payload = sale ? { reference: input.reference, transaction_type: "sale", submitted_by: input.submittedBy, customer: input.customer, project: input.project, description: input.description, amount, proposed_richard_pct: richard, proposed_anastasia_pct: anastasia, proposed_jean_claude_pct: jean, status: "pending_approval" } : { reference: input.reference, transaction_type: "expense", submitted_by: input.submittedBy, description: input.description, amount, category: input.category, proposed_allocation: input.allocation, final_allocation: input.allocation === "Company overhead" ? "Company overhead" : null, status: input.allocation === "Company overhead" ? "overhead" : "awaiting_allocation" };
    const { data, error } = await supabase.from("transactions").insert(payload as Record<string, unknown>).select().single();
    if (error) throw new Error(error.code === "23505" ? "That reference already exists." : error.message);
    return NextResponse.json({ transaction: data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save transaction." }, { status: 400 }); }
}
