"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Employee = { id: string; name: string; role: "manager" | "salesperson" | "expense_reporter" };
type Transaction = {
  id: string; reference: string; transaction_type: "sale" | "expense"; description: string;
  amount: number; project: "A" | "B" | null; category: string | null;
  proposed_allocation: string | null; final_allocation: string | null; status: string;
  proposed_richard_pct: number | null; proposed_anastasia_pct: number | null; proposed_jean_claude_pct: number | null;
  approved_richard_pct: number | null; approved_anastasia_pct: number | null; approved_jean_claude_pct: number | null;
  employees: { name: string } | null;
};

const names = ["Svetlana de Monte Carlo", "Richard Darling", "Anastasia Ferrari", "Jean-Claude Bērziņš", "Kevin von Whatever"];
const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedName, setSelectedName] = useState(names[0]);
  const [notice, setNotice] = useState("");
  const current = employees.find((e) => e.name === selectedName);

  async function refresh() {
    const response = await fetch("/api/transactions");
    const data = await response.json();
    if (response.ok) { setEmployees(data.employees); setTransactions(data.transactions); }
    else setNotice(data.error ?? "Could not load data.");
  }
  useEffect(() => { refresh(); }, []);

  const totals = useMemo(() => {
    const approvedSales = transactions.filter((t) => t.transaction_type === "sale" && t.status === "approved");
    const expenses = transactions.filter((t) => t.transaction_type === "expense");
    const saleTotal = approvedSales.reduce((n, t) => n + Number(t.amount), 0);
    const commissions = approvedSales.reduce((n, t) => n + Number(t.amount) * 0.1, 0);
    const expenseTotal = expenses.reduce((n, t) => n + Number(t.amount), 0);
    return { saleTotal, commissions, expenseTotal, result: saleTotal - commissions - expenseTotal };
  }, [transactions]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.submittedBy = current?.id ?? "";
    const response = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    setNotice(response.ok ? `Saved ${data.transaction.reference}.` : data.error);
    if (response.ok) { event.currentTarget.reset(); await refresh(); }
  }

  async function approve(transaction: Transaction) {
    const response = await fetch(`/api/transactions/${transaction.id}/approve`, { method: "POST" });
    const data = await response.json();
    setNotice(response.ok ? `${transaction.reference} approved.` : data.error);
    if (response.ok) await refresh();
  }

  return <main>
    <header><p className="eyebrow">Friends Included Ltd</p><h1>Finance dashboard</h1><p>All friendships expire at checkout.</p></header>
    <section className="role"><label>Demonstration role<select value={selectedName} onChange={(e) => setSelectedName(e.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select></label><span>{current ? current.role.replace("_", " ") : "Loading employees…"}</span></section>
    {notice && <p className="notice">{notice}</p>}
    <section className="totals"><article><b>Approved income</b><strong>{money.format(totals.saleTotal)}</strong></article><article><b>Commission expense</b><strong>{money.format(totals.commissions)}</strong></article><article><b>All expenses</b><strong>{money.format(totals.expenseTotal)}</strong></article><article><b>Company result</b><strong>{money.format(totals.result)}</strong></article></section>
    {current?.role === "salesperson" && <TransactionForm title="Record a sale" type="sale" onSubmit={submit} />}
    {current?.role === "expense_reporter" && <TransactionForm title="Record an expense" type="expense" onSubmit={submit} />}
    {current?.role === "manager" && <section><h2>Manager approval queue</h2><div className="list">{transactions.filter((t) => t.status === "pending_approval" || t.status === "awaiting_allocation").map((t) => <article className="record" key={t.id}><div><b>{t.reference}</b> · {t.transaction_type} · {money.format(Number(t.amount))}<br/><small>{t.description}</small></div><button onClick={() => approve(t)}>Approve proposed decision</button></article>)}{transactions.filter((t) => t.status === "pending_approval" || t.status === "awaiting_allocation").length === 0 && <p>Nothing awaits a decision.</p>}</div></section>}
    <section><h2>Transaction records</h2><div className="list">{transactions.map((t) => <article className="record" key={t.id}><div><b>{t.reference}</b> · {t.transaction_type} · {money.format(Number(t.amount))}<br/><small>{t.employees?.name ?? "Unknown"} · {t.status} · {t.project ?? t.final_allocation ?? t.proposed_allocation}</small></div></article>)}{transactions.length === 0 && <p>No transactions yet.</p>}</div></section>
  </main>;
}

function TransactionForm({ title, type, onSubmit }: { title: string; type: "sale" | "expense"; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const sale = type === "sale";
  return <section><h2>{title}</h2><form onSubmit={onSubmit}><input type="hidden" name="transactionType" value={type}/><label>Reference<input required name="reference" placeholder={sale ? "S01" : "E01"}/></label>{sale && <><label>Customer<input required name="customer"/></label><label>Project<select name="project"><option value="A">Project A</option><option value="B">Project B</option></select></label></>}<label>Description<input required name="description"/></label><label>Amount (€)<input required name="amount" type="number" min="0.01" step="0.01"/></label>{sale ? <><label>Richard %<input required name="richardPct" type="number" min="0" max="100"/></label><label>Anastasia %<input required name="anastasiaPct" type="number" min="0" max="100"/></label><label>Jean-Claude %<input required name="jeanPct" type="number" min="0" max="100"/></label></> : <><label>Category<select name="category"><option>Materials</option><option>Travel</option><option>Other</option></select></label><label>Proposed allocation<select name="allocation"><option value="A">Project A</option><option value="B">Project B</option><option value="Company overhead">Company overhead</option></select></label></>}<button type="submit">Save {sale ? "sale" : "expense"}</button></form></section>;
}
