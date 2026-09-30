"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { calculateDashboard, commissionFor } from "@/lib/finance";

type Role = "manager" | "salesperson" | "expense_reporter";
type Employee = { id: string; name: string; role: Role; telegram_user_id: string | null; telegram_chat_id: string | null };
type Notification = { id: string; kind: string; status: "pending" | "sent" | "failed" | "not_required"; error: string | null };
type Transaction = {
  id: string; reference: string; transaction_type: "sale" | "expense"; submitted_by: string; submitted_at: string;
  description: string; amount: number | string; customer: string | null; project: "A" | "B" | null; category: string | null;
  proposed_allocation: string | null; final_allocation: string | null; status: string; manager_note: string | null;
  proposed_richard_pct: number | string | null; proposed_anastasia_pct: number | string | null; proposed_jean_claude_pct: number | string | null;
  approved_richard_pct: number | string | null; approved_anastasia_pct: number | string | null; approved_jean_claude_pct: number | string | null;
  sync_status: "pending" | "synced" | "failed" | null; sync_error: string | null;
  submitted_via: "website" | "telegram"; originating_telegram_chat_id: string | null;
  employees: { name: string } | null; transaction_notifications?: Notification[];
};
type TelegramContact = { telegram_user_id: string; chat_id: string; username: string | null; first_name: string | null; employee_id: string | null; last_seen_at: string };

const names = ["Svetlana de Monte Carlo", "Richard Darling", "Anastasia Ferrari", "Jean-Claude Bērziņš", "Kevin von Whatever"];
const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const euro = (cents: number) => money.format(cents / 100);
const statusLabel = (status: string) => status.replaceAll("_", " ");

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contacts, setContacts] = useState<TelegramContact[]>([]);
  const [selectedName, setSelectedName] = useState(names[0]);
  const [notice, setNotice] = useState("");
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const current = employees.find((employee) => employee.name === selectedName);

  async function refresh() {
    const response = await fetch("/api/transactions", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error ?? "Could not load data."); return; }
    setEmployees(data.employees ?? []); setTransactions(data.transactions ?? []); setContacts(data.contacts ?? []);
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { fetch("/api/telegram/info").then((response) => response.json()).then((data) => setBotUrl(data.botUrl ?? null)).catch(() => undefined); }, []);

  const dashboard = useMemo(() => calculateDashboard(transactions), [transactions]);
  const visibleTransactions = current?.role === "manager" ? transactions : transactions.filter((transaction) => transaction.submitted_by === current?.id);
  const queue = transactions.filter((transaction) => transaction.status === "pending_approval" || transaction.status === "awaiting_allocation");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = Object.fromEntries(new FormData(formElement).entries());
    body.submittedBy = current?.id ?? "";
    const response = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    setNotice(response.ok ? `${data.transaction.reference} saved. ${data.sync?.ok ? "Google Sheets synchronized." : "Google Sheets needs a retry."}` : data.error);
    if (response.ok) { formElement.reset(); await refresh(); }
  }

  async function approve(transaction: Transaction, values: Record<string, string>) {
    const response = await fetch(`/api/transactions/${transaction.id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId: current?.id, ...values })
    });
    const data = await response.json();
    if (!response.ok) setNotice(data.error);
    else setNotice(data.alreadyDecided ? `${transaction.reference} was already decided; totals were not changed.` : `${transaction.reference} decision saved. ${data.sync?.ok ? "Sheets synchronized." : "Sheets needs a retry."}`);
    if (response.ok) await refresh();
  }

  async function retrySheets(transaction: Transaction) {
    const response = await fetch(`/api/transactions/${transaction.id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId: current?.id }) });
    const data = await response.json(); setNotice(response.ok ? `${transaction.reference} synchronized to Google Sheets.` : data.error); if (response.ok) await refresh();
  }

  async function retryTelegram(transaction: Transaction, notification: Notification) {
    const response = await fetch(`/api/transactions/${transaction.id}/notifications/${notification.id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId: current?.id }) });
    const data = await response.json(); setNotice(response.ok ? "Telegram delivery retried." : data.error); if (response.ok) await refresh();
  }

  async function linkContact(telegramUserId: string, employeeId: string) {
    const response = await fetch("/api/telegram/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId: current?.id, telegramUserId, employeeId }) });
    const data = await response.json(); setNotice(response.ok ? data.message : data.error); if (response.ok) await refresh();
  }

  async function connectBot() {
    const response = await fetch("/api/telegram/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId: current?.id }) });
    const data = await response.json();
    setNotice(response.ok ? "Telegram webhook connected. Send /start to the bot next." : data.error);
    if (data.botUrl) setBotUrl(data.botUrl);
  }

  return <main>
    <header>
      <p className="eyebrow">Friends Included Ltd</p>
      <h1>Finance dashboard</h1>
      <p>All friendships expire at checkout.</p>
      <p className="links"><a href="https://github.com/ratgalins-creator/friends-included-finance" target="_blank">GitHub code</a><a href="https://docs.google.com/spreadsheets/d/1yEy83q8MKyIRvy9843Kn-8mpkv6Y-M-Ng1T80RpQXQk/edit?gid=0#gid=0" target="_blank">Google Sheets copy</a>{botUrl && <a href={botUrl} target="_blank">Telegram bot</a>}</p>
    </header>

    <section className="role">
      <label>Demonstration role<select value={selectedName} onChange={(event) => setSelectedName(event.target.value)}>{names.map((name) => <option key={name}>{name}</option>)}</select></label>
      <span>{current ? current.role.replace("_", " ") : "Loading employees…"}</span>
    </section>
    {notice && <p className="notice">{notice}</p>}

    <FinanceDashboard dashboard={dashboard} />

    {current?.role === "salesperson" && <TransactionForm title="Record a sale" type="sale" onSubmit={submit} />}
    {current?.role === "expense_reporter" && <TransactionForm title="Record an expense" type="expense" onSubmit={submit} />}

    {current?.role === "manager" && <>
      <section>
        <h2>Manager approval queue</h2>
        <div className="list">{queue.map((transaction) => <DecisionCard key={transaction.id} transaction={transaction} onApprove={approve} />)}{queue.length === 0 && <p>Nothing awaits a decision.</p>}</div>
      </section>
      <section>
        <h2>Telegram manager setup</h2>
        <p>First use <button className="inlineButton" onClick={connectBot}>Connect Telegram bot</button>, then each person sends <code>/start</code> to it. Link their collected Telegram ID here; a bot user cannot choose their own role.</p>
        <div className="list">{contacts.map((contact) => <ContactCard key={contact.telegram_user_id} contact={contact} employees={employees} onLink={linkContact} />)}{contacts.length === 0 && <p>No bot user has started a chat yet.</p>}</div>
      </section>
    </>}

    <section>
      <h2>{current?.role === "manager" ? "All transaction records" : "My transaction records"}</h2>
      <div className="list">{visibleTransactions.map((transaction) => <TransactionRecord key={transaction.id} transaction={transaction} manager={current?.role === "manager"} onRetrySheets={retrySheets} onRetryTelegram={retryTelegram} />)}{visibleTransactions.length === 0 && <p>No transactions yet.</p>}</div>
    </section>

    <section className="instructions">
      <h2>How to test</h2>
      <ol>
        <li>Choose a demonstration role to enter a transaction or approve a decision.</li>
        <li>For the required bot test, send <code>/start</code> to the Telegram bot, select Svetlana here, and link the displayed Telegram contact to the fictional employee.</li>
        <li>Use <code>/sale</code> or <code>/expense</code> in the private bot chat. The record is saved in Supabase, copied to Sheets, and remains tied to that original chat for later decisions.</li>
        <li>Google Sheets is read-only evidence: edits there never change the application.</li>
      </ol>
    </section>
  </main>;
}

function FinanceDashboard({ dashboard }: { dashboard: ReturnType<typeof calculateDashboard> }) {
  return <>
    <section className="totals"><article><b>Approved income</b><strong>{euro(dashboard.company.income)}</strong></article><article><b>Commission expense</b><strong>{euro(dashboard.company.commissions)}</strong></article><article><b>All recorded expenses</b><strong>{euro(dashboard.company.expenses)}</strong></article><article><b>Company result</b><strong>{euro(dashboard.company.result)}</strong></article></section>
    <section className="dashboardGrid">
      {(["A", "B"] as const).map((project) => <article className="dashboardCard" key={project}><h2>Project {project} result</h2><dl><dt>Approved income</dt><dd>{euro(dashboard.projects[project].income)}</dd><dt>Commission expense</dt><dd>{euro(dashboard.projects[project].commissions)}</dd><dt>Allocated expenses</dt><dd>{euro(dashboard.projects[project].expenses)}</dd><dt>Result</dt><dd><b>{euro(dashboard.projects[project].result)}</b></dd></dl></article>)}
      <article className="dashboardCard"><h2>Company reconciliation</h2><dl><dt>Company overhead</dt><dd>{euro(dashboard.company.overhead)}</dd><dt>Awaiting allocation</dt><dd>{euro(dashboard.company.awaitingAllocation)}</dd><dt>Richard commission</dt><dd>{euro(dashboard.people.richard)}</dd><dt>Anastasia commission</dt><dd>{euro(dashboard.people.anastasia)}</dd><dt>Jean-Claude commission</dt><dd>{euro(dashboard.people.jeanClaude)}</dd></dl></article>
    </section>
  </>;
}

function TransactionForm({ title, type, onSubmit }: { title: string; type: "sale" | "expense"; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const sale = type === "sale";
  return <section><h2>{title}</h2><form onSubmit={onSubmit}><input type="hidden" name="transactionType" value={type} />
    <label>Reference<input required name="reference" placeholder={sale ? "S01" : "E01"} /></label>
    {sale && <><label>Customer<input required name="customer" /></label><label>Project<select name="project"><option value="A">Project A</option><option value="B">Project B</option></select></label></>}
    <label>Description<input required name="description" /></label><label>Amount (€)<input required name="amount" type="number" min="0.01" step="0.01" /></label>
    {sale ? <><label>Richard %<input required name="richardPct" type="number" min="0" max="100" /></label><label>Anastasia %<input required name="anastasiaPct" type="number" min="0" max="100" /></label><label>Jean-Claude %<input required name="jeanPct" type="number" min="0" max="100" /></label></> : <><label>Category<select name="category"><option>Materials</option><option>Travel</option><option>Other</option></select></label><label>Proposed allocation<select name="allocation"><option value="A">Project A</option><option value="B">Project B</option><option value="Company overhead">Company overhead</option></select></label></>}
    <button type="submit">Save {sale ? "sale" : "expense"}</button></form></section>;
}

function DecisionCard({ transaction, onApprove }: { transaction: Transaction; onApprove: (transaction: Transaction, values: Record<string, string>) => Promise<void> }) {
  const [richard, setRichard] = useState(String(transaction.proposed_richard_pct ?? 0));
  const [anastasia, setAnastasia] = useState(String(transaction.proposed_anastasia_pct ?? 0));
  const [jean, setJean] = useState(String(transaction.proposed_jean_claude_pct ?? 0));
  const [allocation, setAllocation] = useState(transaction.proposed_allocation ?? "A");
  const [note, setNote] = useState("");
  const sale = transaction.transaction_type === "sale";
  return <article className="record decision"><div><b>{transaction.reference}</b> · {sale ? "sale" : "expense"} · {money.format(Number(transaction.amount))}<br /><small>{transaction.description}</small><br /><small>Original proposal: {sale ? `Richard ${transaction.proposed_richard_pct}% · Anastasia ${transaction.proposed_anastasia_pct}% · Jean-Claude ${transaction.proposed_jean_claude_pct}%` : transaction.proposed_allocation}</small></div>
    <div className="decisionControls">{sale ? <div className="splitInputs"><label>Richard<input value={richard} onChange={(event) => setRichard(event.target.value)} type="number" min="0" max="100" /></label><label>Anastasia<input value={anastasia} onChange={(event) => setAnastasia(event.target.value)} type="number" min="0" max="100" /></label><label>Jean-Claude<input value={jean} onChange={(event) => setJean(event.target.value)} type="number" min="0" max="100" /></label></div> : <label>Final allocation<select value={allocation} onChange={(event) => setAllocation(event.target.value)}><option value="A">Project A</option><option value="B">Project B</option><option value="Company overhead">Company overhead</option></select></label>}<label>Manager note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} /></label><button onClick={() => void onApprove(transaction, sale ? { richardPct: richard, anastasiaPct: anastasia, jeanPct: jean, note } : { finalAllocation: allocation, note })}>Save decision</button></div>
  </article>;
}

function ContactCard({ contact, employees, onLink }: { contact: TelegramContact; employees: Employee[]; onLink: (telegramUserId: string, employeeId: string) => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState(contact.employee_id ?? "");
  const label = contact.username ? `@${contact.username}` : contact.first_name || "Telegram user";
  return <article className="record contact"><div><b>{label}</b><br /><small>Telegram user ID: {contact.telegram_user_id} · last started: {new Date(contact.last_seen_at).toLocaleString()}</small></div><div><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Choose employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.role.replace("_", " ")}</option>)}</select><button disabled={!employeeId} onClick={() => void onLink(contact.telegram_user_id, employeeId)}>Link role</button></div></article>;
}

function TransactionRecord({ transaction, manager, onRetrySheets, onRetryTelegram }: { transaction: Transaction; manager: boolean; onRetrySheets: (transaction: Transaction) => Promise<void>; onRetryTelegram: (transaction: Transaction, notification: Notification) => Promise<void> }) {
  const earned = commissionFor(transaction);
  const decisions = transaction.transaction_notifications?.filter((notification) => notification.kind === "decision") ?? [];
  return <article className="record"><div><b>{transaction.reference}</b> · {transaction.transaction_type} · {money.format(Number(transaction.amount))}<br /><small>{transaction.employees?.name ?? "Unknown"} · {statusLabel(transaction.status)} · {transaction.submitted_via}</small>
    {transaction.transaction_type === "sale" && earned && <small className="line">Commission: Richard {euro(earned.richard)} · Anastasia {euro(earned.anastasia)} · Jean-Claude {euro(earned.jeanClaude)}</small>}
    {transaction.transaction_type === "expense" && <small className="line">Proposed: {transaction.proposed_allocation}; final: {transaction.final_allocation ?? "awaiting decision"}</small>}
    <small className="line">Sheets: {transaction.sync_status ?? "pending"}{transaction.sync_error ? ` — ${transaction.sync_error}` : ""}</small>
    {decisions.map((notification) => <small className="line" key={notification.id}>Telegram decision: {notification.status}{notification.error ? ` — ${notification.error}` : ""}</small>)}
    {manager && !transaction.originating_telegram_chat_id && <small className="line">Telegram recipient: No Telegram recipient linked.</small>}
  </div><div className="actions">{manager && transaction.sync_status === "failed" && <button onClick={() => void onRetrySheets(transaction)}>Retry Sheets sync</button>}{manager && decisions.filter((notification) => notification.status === "failed").map((notification) => <button key={notification.id} onClick={() => void onRetryTelegram(transaction, notification)}>Retry Telegram delivery</button>)}</div></article>;
}
