export type CommissionSplit = { richard: number; anastasia: number; jeanClaude: number };

type NumberLike = number | string | null | undefined;
type TransactionForFinance = {
  transaction_type: "sale" | "expense";
  status: string;
  amount: NumberLike;
  project?: string | null;
  final_allocation?: string | null;
  approved_richard_pct?: NumberLike;
  approved_anastasia_pct?: NumberLike;
  approved_jean_claude_pct?: NumberLike;
};

const priority = ["richard", "anastasia", "jeanClaude"] as const;

export function number(value: NumberLike) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function cents(value: NumberLike) {
  return Math.round(number(value) * 100);
}

export function validSplit(split: CommissionSplit) {
  const values = [split.richard, split.anastasia, split.jeanClaude];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
    && Math.round((split.richard + split.anastasia + split.jeanClaude) * 100) === 10000;
}

/**
 * The 10% pool and every individual share are rounded to cents. Any remaining
 * cent(s) go to the highest percentage; equal shares use Richard, Anastasia,
 * then Jean-Claude. This is the deterministic coursework rounding rule.
 */
export function commissions(amount: NumberLike, split: CommissionSplit) {
  const pool = Math.round(cents(amount) * 0.1);
  const percentages = split;
  const result = {
    richard: Math.floor((pool * percentages.richard) / 100),
    anastasia: Math.floor((pool * percentages.anastasia) / 100),
    jeanClaude: Math.floor((pool * percentages.jeanClaude) / 100)
  };
  const assigned = result.richard + result.anastasia + result.jeanClaude;
  const winner = [...priority].sort((left, right) => percentages[right] - percentages[left])[0];
  result[winner] += pool - assigned;
  return { pool, ...result };
}

export function approvedSplit(transaction: TransactionForFinance): CommissionSplit | null {
  if (transaction.transaction_type !== "sale" || transaction.status !== "approved") return null;
  return {
    richard: number(transaction.approved_richard_pct),
    anastasia: number(transaction.approved_anastasia_pct),
    jeanClaude: number(transaction.approved_jean_claude_pct)
  };
}

export function commissionFor(transaction: TransactionForFinance) {
  const split = approvedSplit(transaction);
  return split ? commissions(transaction.amount, split) : null;
}

export function calculateDashboard(transactions: TransactionForFinance[]) {
  const projects = {
    A: { income: 0, commissions: 0, expenses: 0, result: 0 },
    B: { income: 0, commissions: 0, expenses: 0, result: 0 }
  };
  const people = { richard: 0, anastasia: 0, jeanClaude: 0 };
  let companyIncome = 0;
  let allExpenses = 0;
  let overhead = 0;
  let awaitingAllocation = 0;

  for (const transaction of transactions) {
    const amount = cents(transaction.amount);
    if (transaction.transaction_type === "sale" && transaction.status === "approved") {
      const project = transaction.project === "B" ? "B" : "A";
      const commission = commissionFor(transaction)!;
      projects[project].income += amount;
      projects[project].commissions += commission.pool;
      companyIncome += amount;
      people.richard += commission.richard;
      people.anastasia += commission.anastasia;
      people.jeanClaude += commission.jeanClaude;
      continue;
    }
    if (transaction.transaction_type === "expense") {
      allExpenses += amount;
      if (transaction.status === "awaiting_allocation") awaitingAllocation += amount;
      else if (transaction.final_allocation === "A" || transaction.final_allocation === "B") projects[transaction.final_allocation].expenses += amount;
      else if (transaction.final_allocation === "Company overhead") overhead += amount;
    }
  }

  for (const project of [projects.A, projects.B]) project.result = project.income - project.commissions - project.expenses;
  const commissionTotal = people.richard + people.anastasia + people.jeanClaude;
  return {
    projects,
    people,
    company: {
      income: companyIncome,
      commissions: commissionTotal,
      expenses: allExpenses,
      overhead,
      awaitingAllocation,
      result: companyIncome - commissionTotal - allExpenses
    }
  };
}
