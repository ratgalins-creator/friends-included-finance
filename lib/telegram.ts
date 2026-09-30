import type { SupabaseClient } from "@supabase/supabase-js";
import { createTransaction } from "@/lib/transactions";
import { notifyManagerOfSubmission, recordAndSendNotification, submissionMessage } from "@/lib/notifications";

type TelegramMessage = {
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string; last_name?: string };
  text?: string;
};

type TelegramUpdate = { message?: TelegramMessage };
type Session = { flow: "sale" | "expense"; step: string; payload: Record<string, string> };

const help = [
  "Friends Included Finance bot",
  "/start — register this chat for manager linking",
  "/id — show your Telegram ID",
  "/sale — submit a sale (salespeople only)",
  "/expense — submit an expense (Kevin only)",
  "/cancel — cancel the current entry"
].join("\n");

function normalText(value: string) { return value.trim(); }
function normalizeAllocation(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "a" || clean === "project a") return "A";
  if (clean === "b" || clean === "project b") return "B";
  if (clean === "company overhead" || clean === "overhead" || clean === "company") return "Company overhead";
  return null;
}
function normalizeCategory(value: string) {
  const clean = value.trim().toLowerCase();
  return clean === "materials" ? "Materials" : clean === "travel" ? "Travel" : clean === "other" ? "Other" : null;
}
function validAmount(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function validProject(value: string) { const text = value.trim().toUpperCase(); return text === "A" || text === "B" ? text : null; }
function validSplit(value: string) {
  const values = value.trim().split(/[\s,/]+/).filter(Boolean).map(Number);
  if (values.length !== 3 || !values.every((item) => Number.isFinite(item) && item >= 0 && item <= 100) || Math.round(values.reduce((sum, item) => sum + item, 0) * 100) !== 10000) return null;
  return values;
}

async function reply(chatId: string, text: string) {
  const { sendTelegramMessage } = await import("@/lib/telegram-api");
  await sendTelegramMessage(chatId, text);
}

async function saveContact(supabase: SupabaseClient, message: TelegramMessage) {
  if (!message.from) throw new Error("Telegram update has no sender.");
  const contact = {
    telegram_user_id: String(message.from.id), chat_id: String(message.chat.id), username: message.from.username ?? null,
    first_name: message.from.first_name ?? null, last_name: message.from.last_name ?? null, last_seen_at: new Date().toISOString()
  };
  const { error } = await supabase.from("telegram_contacts").upsert(contact, { onConflict: "telegram_user_id" });
  if (error) throw new Error(error.message);
  return contact;
}

async function linkedEmployee(supabase: SupabaseClient, telegramUserId: string) {
  const { data } = await supabase.from("employees").select("id,name,role").eq("telegram_user_id", telegramUserId).maybeSingle();
  return data;
}

async function loadSession(supabase: SupabaseClient, telegramUserId: string): Promise<Session | null> {
  const { data } = await supabase.from("telegram_sessions").select("flow,step,payload").eq("telegram_user_id", telegramUserId).maybeSingle();
  return data ? { flow: data.flow, step: data.step, payload: data.payload ?? {} } : null;
}

async function saveSession(supabase: SupabaseClient, telegramUserId: string, chatId: string, session: Session) {
  const { error } = await supabase.from("telegram_sessions").upsert({
    telegram_user_id: telegramUserId, chat_id: chatId, flow: session.flow, step: session.step, payload: session.payload, updated_at: new Date().toISOString()
  }, { onConflict: "telegram_user_id" });
  if (error) throw new Error(error.message);
}

async function clearSession(supabase: SupabaseClient, telegramUserId: string) {
  await supabase.from("telegram_sessions").delete().eq("telegram_user_id", telegramUserId);
}

function saleSummary(payload: Record<string, string>) {
  return `Check sale:\nReference: ${payload.reference}\nCustomer: ${payload.customer}\nProject: ${payload.project}\nDescription: ${payload.description}\nAmount: €${payload.amount}\nProposed split: Richard ${payload.richardPct}% / Anastasia ${payload.anastasiaPct}% / Jean-Claude ${payload.jeanPct}%\n\nReply YES to submit or /cancel.`;
}
function expenseSummary(payload: Record<string, string>) {
  return `Check expense:\nReference: ${payload.reference}\nDescription: ${payload.description}\nAmount: €${payload.amount}\nCategory: ${payload.category}\nProposed allocation: ${payload.allocation}\n\nReply YES to submit or /cancel.`;
}

async function continueSale(supabase: SupabaseClient, chatId: string, userId: string, session: Session, input: string) {
  const value = normalText(input);
  const next = { ...session, payload: { ...session.payload } };
  if (next.step === "reference") {
    if (!value) return reply(chatId, "Send a unique sale reference, for example S01.");
    next.payload.reference = value.toUpperCase(); next.step = "customer";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Customer name?");
  }
  if (next.step === "customer") {
    if (!value) return reply(chatId, "Send the customer name.");
    next.payload.customer = value; next.step = "project";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Project? Reply A for Respectable Relatives or B for Drunk University Friends.");
  }
  if (next.step === "project") {
    const project = validProject(value);
    if (!project) return reply(chatId, "Reply A or B.");
    next.payload.project = project; next.step = "description";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Short sale description?");
  }
  if (next.step === "description") {
    if (!value) return reply(chatId, "Send a description.");
    next.payload.description = value; next.step = "amount";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Amount in euros? For example: 1000");
  }
  if (next.step === "amount") {
    const amount = validAmount(value);
    if (!amount) return reply(chatId, "Send an amount above zero, for example 1000.");
    next.payload.amount = String(amount); next.step = "split";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Proposed commission split in Richard / Anastasia / Jean-Claude order. Example: 50/30/20. It must total 100.");
  }
  if (next.step === "split") {
    const split = validSplit(value);
    if (!split) return reply(chatId, "Send three percentages totaling 100, for example 50/30/20.");
    [next.payload.richardPct, next.payload.anastasiaPct, next.payload.jeanPct] = split.map(String); next.step = "confirm";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, saleSummary(next.payload));
  }
  if (next.step === "confirm") {
    if (value.toLowerCase() !== "yes") return reply(chatId, "Reply YES to submit this sale, or use /cancel.");
    const employee = await linkedEmployee(supabase, userId);
    if (!employee) return reply(chatId, "Your Telegram account is no longer linked. Ask the manager to link it again.");
    const created = await createTransaction(supabase, { ...next.payload, transactionType: "sale" }, employee.id, "telegram", chatId, userId);
    await clearSession(supabase, userId);
    await recordAndSendNotification(supabase, created.transaction.id, "submission_confirmation", chatId, submissionMessage(created.transaction));
    await notifyManagerOfSubmission(supabase, created.transaction);
    return;
  }
}

async function continueExpense(supabase: SupabaseClient, chatId: string, userId: string, session: Session, input: string) {
  const value = normalText(input);
  const next = { ...session, payload: { ...session.payload } };
  if (next.step === "reference") {
    if (!value) return reply(chatId, "Send a unique expense reference, for example E01.");
    next.payload.reference = value.toUpperCase(); next.step = "description";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Expense description?");
  }
  if (next.step === "description") {
    if (!value) return reply(chatId, "Send a description.");
    next.payload.description = value; next.step = "amount";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Amount in euros? For example: 120");
  }
  if (next.step === "amount") {
    const amount = validAmount(value);
    if (!amount) return reply(chatId, "Send an amount above zero, for example 120.");
    next.payload.amount = String(amount); next.step = "category";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Category? Reply Materials, Travel, or Other.");
  }
  if (next.step === "category") {
    const category = normalizeCategory(value);
    if (!category) return reply(chatId, "Reply Materials, Travel, or Other.");
    next.payload.category = category; next.step = "allocation";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, "Proposed allocation? Reply A, B, or Company overhead.");
  }
  if (next.step === "allocation") {
    const allocation = normalizeAllocation(value);
    if (!allocation) return reply(chatId, "Reply A, B, or Company overhead.");
    next.payload.allocation = allocation; next.step = "confirm";
    await saveSession(supabase, userId, chatId, next); return reply(chatId, expenseSummary(next.payload));
  }
  if (next.step === "confirm") {
    if (value.toLowerCase() !== "yes") return reply(chatId, "Reply YES to submit this expense, or use /cancel.");
    const employee = await linkedEmployee(supabase, userId);
    if (!employee) return reply(chatId, "Your Telegram account is no longer linked. Ask the manager to link it again.");
    const created = await createTransaction(supabase, { ...next.payload, transactionType: "expense" }, employee.id, "telegram", chatId, userId);
    await clearSession(supabase, userId);
    await recordAndSendNotification(supabase, created.transaction.id, "submission_confirmation", chatId, submissionMessage(created.transaction));
    await notifyManagerOfSubmission(supabase, created.transaction);
    return;
  }
}

export async function processTelegramUpdate(supabase: SupabaseClient, update: TelegramUpdate) {
  const message = update.message;
  if (!message?.from || !message.text) return;
  const contact = await saveContact(supabase, message);
  const chatId = contact.chat_id;
  const command = message.text.trim().split(/\s+/, 1)[0].toLowerCase().replace(/@[^\s]+$/, "");
  if (command === "/start") {
    const employee = await linkedEmployee(supabase, contact.telegram_user_id);
    return reply(chatId, employee ? `This chat is linked to ${employee.name} (${employee.role.replace("_", " ")}).\n\n${help}` : `Your Telegram ID is ${contact.telegram_user_id}. A manager must link it to a Friends Included employee before you can submit anything.\n\n${help}`);
  }
  if (command === "/id") return reply(chatId, `Telegram user ID: ${contact.telegram_user_id}\nThis chat ID is stored automatically after /start.`);
  if (command === "/help") return reply(chatId, help);
  if (command === "/cancel") { await clearSession(supabase, contact.telegram_user_id); return reply(chatId, "Current entry cancelled."); }

  const employee = await linkedEmployee(supabase, contact.telegram_user_id);
  if (command === "/sale") {
    if (!employee) return reply(chatId, "You are not linked to an employee yet. Ask Svetlana to link your Telegram ID in the website setup screen.");
    if (employee.role !== "salesperson") return reply(chatId, "Only a linked salesperson can submit a sale.");
    await saveSession(supabase, contact.telegram_user_id, chatId, { flow: "sale", step: "reference", payload: {} });
    return reply(chatId, "Sale entry started. Send a unique reference, for example S01.");
  }
  if (command === "/expense") {
    if (!employee) return reply(chatId, "You are not linked to an employee yet. Ask Svetlana to link your Telegram ID in the website setup screen.");
    if (employee.role !== "expense_reporter") return reply(chatId, "Only Kevin can submit an expense.");
    await saveSession(supabase, contact.telegram_user_id, chatId, { flow: "expense", step: "reference", payload: {} });
    return reply(chatId, "Expense entry started. Send a unique reference, for example E01.");
  }

  const session = await loadSession(supabase, contact.telegram_user_id);
  if (!session) return reply(chatId, `I did not recognise that.\n\n${help}`);
  try {
    if (session.flow === "sale") await continueSale(supabase, chatId, contact.telegram_user_id, session, message.text);
    else await continueExpense(supabase, chatId, contact.telegram_user_id, session, message.text);
  } catch (error) {
    const description = error instanceof Error ? error.message : "Could not save this transaction.";
    await reply(chatId, `Nothing was recorded: ${description} Fix the information and continue, or use /cancel.`);
  }
}
