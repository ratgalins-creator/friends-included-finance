import { google } from "googleapis";
import { commissionFor } from "@/lib/finance";

type TransactionForSheet = {
  reference: string;
  transaction_type: "sale" | "expense";
  submitted_at: string;
  customer: string | null;
  project: string | null;
  description: string;
  amount: number | string;
  category: string | null;
  proposed_allocation: string | null;
  final_allocation: string | null;
  status: string;
  proposed_richard_pct: number | string | null;
  proposed_anastasia_pct: number | string | null;
  proposed_jean_claude_pct: number | string | null;
  approved_richard_pct: number | string | null;
  approved_anastasia_pct: number | string | null;
  approved_jean_claude_pct: number | string | null;
  employees: { name: string } | null;
};

const salesHeaders = [
  "Reference", "Submission time", "Salesperson", "Customer", "Project", "Description", "Amount",
  "Proposed Richard %", "Proposed Anastasia %", "Proposed Jean-Claude %",
  "Approved Richard %", "Approved Anastasia %", "Approved Jean-Claude %",
  "Richard commission", "Anastasia commission", "Jean-Claude commission", "Status"
];

const expenseHeaders = [
  "Reference", "Submission time", "Reporter", "Description", "Category", "Amount",
  "Proposed allocation", "Final allocation", "Status"
];

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function percentage(value: number | string | null) {
  return value === null ? "" : Number(value);
}

async function sheetsClient() {
  const credentials = JSON.parse(requiredEnvironment("GOOGLE_SERVICE_ACCOUNT_JSON"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureHeaders(tab: string, headers: string[]) {
  const sheets = await sheetsClient();
  const spreadsheetId = requiredEnvironment("GOOGLE_SHEETS_SPREADSHEET_ID");
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` });
  if ((data.values?.[0] ?? []).join("|") !== headers.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] }
    });
  }
}

async function writeByReference(tab: string, headers: string[], row: (string | number)[]) {
  const sheets = await sheetsClient();
  const spreadsheetId = requiredEnvironment("GOOGLE_SHEETS_SPREADSHEET_ID");
  await ensureHeaders(tab, headers);
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:A` });
  const existingRow = (data.values ?? []).findIndex((values, index) => index > 0 && values[0] === row[0]);
  const range = existingRow === -1 ? `${tab}!A${(data.values?.length ?? 1) + 1}` : `${tab}!A${existingRow + 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

export async function syncTransactionToGoogleSheets(transaction: TransactionForSheet) {
  if (transaction.transaction_type === "sale") {
    const earned = commissionFor(transaction);
    await writeByReference("Sales", salesHeaders, [
      transaction.reference,
      new Date(transaction.submitted_at).toISOString(),
      transaction.employees?.name ?? "",
      transaction.customer ?? "",
      transaction.project ?? "",
      transaction.description,
      Number(transaction.amount),
      percentage(transaction.proposed_richard_pct),
      percentage(transaction.proposed_anastasia_pct),
      percentage(transaction.proposed_jean_claude_pct),
      percentage(transaction.approved_richard_pct),
      percentage(transaction.approved_anastasia_pct),
      percentage(transaction.approved_jean_claude_pct),
      earned ? earned.richard / 100 : "",
      earned ? earned.anastasia / 100 : "",
      earned ? earned.jeanClaude / 100 : "",
      transaction.status
    ]);
  } else {
    await writeByReference("Expenses", expenseHeaders, [
      transaction.reference,
      new Date(transaction.submitted_at).toISOString(),
      transaction.employees?.name ?? "",
      transaction.description,
      transaction.category ?? "",
      Number(transaction.amount),
      transaction.proposed_allocation ?? "",
      transaction.final_allocation ?? "",
      transaction.status
    ]);
  }
}
