import { account, transaction, type Db } from '@pfinance/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import { addMonths } from './net-worth.ts'
import { derivedViewConditions, type DerivedView } from './transactions.ts'

// Income vs Expense by month (issue #19): the two derived views totaled per
// calendar month over a recent window, computed server-side from the ledger —
// the web app renders, it never sums (issue #1). derivedViewConditions is the
// canonical predicate, so Transfer legs and Balance Adjustments are excluded
// here by the same definition the Transactions screen uses, and a refund
// (positive amount) counts as Income by the sign rule.

export interface IncomeExpensePoint {
  month: string
  // Positive minor units on both sides: an Expense is stored negative, but a
  // paired-bar total is a magnitude — the sign already did its job selecting
  // the view.
  income: number
  expense: number
}

// "Recent" means the 12 months ending at `through`: a fixed window keeps the
// paired bars readable, unlike the Net Worth line whose cumulative sum must
// span the ledger.
const WINDOW_MONTHS = 12

// Safety valve, not pagination: a mistyped year (2206-01-05 is a valid
// calendar date) must not balloon the response — the net-worth stance.
const MAX_SERIES_MONTHS = 1200

const monthlyTotals = (db: Db, householdId: string, view: DerivedView) => {
  // Month bucketing is pure string slicing on the calendar date, the
  // net-worth convention: no Date, no timezone drift.
  const monthExpr = sql<string>`substr(${transaction.date}, 1, 7)`
  const magnitude = view === 'expense' ? sql`-${transaction.amount}` : sql`${transaction.amount}`
  return db
    .select({
      month: monthExpr,
      total: sql<number>`sum(${magnitude})`.mapWith(Number),
    })
    .from(transaction)
    .innerJoin(account, eq(account.id, transaction.accountId))
    .where(and(eq(account.householdId, householdId), ...derivedViewConditions(view)))
    .groupBy(monthExpr)
    .orderBy(asc(monthExpr))
}

// The series spans the window's occupied part: from the earliest month with
// Income or Expense data (never zero-padded back before the ledger starts)
// through `through` — or the latest such month, when the ledger runs past it
// (a future-dated entry extends the bars rather than vanishing from the
// right edge). Months with no data in between still get a point, so a quiet
// month shows as an honest zero instead of a hole in the axis.
export const monthlyIncomeExpense = async (
  db: Db,
  householdId: string,
  through: string,
): Promise<IncomeExpensePoint[]> => {
  const incomes = await monthlyTotals(db, householdId, 'income')
  const expenses = await monthlyTotals(db, householdId, 'expense')
  if (incomes.length === 0 && expenses.length === 0) return []

  const incomeByMonth = new Map(incomes.map((row) => [row.month, row.total]))
  const expenseByMonth = new Map(expenses.map((row) => [row.month, row.total]))

  // Lexicographic comparison IS chronological for YYYY-MM strings.
  const months = [
    incomes[0]?.month,
    incomes.at(-1)?.month,
    expenses[0]?.month,
    expenses.at(-1)?.month,
  ]
    .filter((month): month is string => month !== undefined)
    .sort()
  const firstData = months[0] ?? through
  const lastData = months.at(-1) ?? through
  const end = lastData > through ? lastData : through
  // The left edge anchors to `through`, never to the extended end: a lone
  // mis-dated future entry may stretch the right edge, but it must not drag
  // the genuinely recent months off the chart.
  const windowStart = addMonths(through, -(WINDOW_MONTHS - 1))
  const start = firstData > windowStart ? firstData : windowStart

  const points: IncomeExpensePoint[] = []
  for (let month = start; month <= end; month = addMonths(month, 1)) {
    points.push({
      month,
      income: incomeByMonth.get(month) ?? 0,
      expense: expenseByMonth.get(month) ?? 0,
    })
  }
  return points.slice(-MAX_SERIES_MONTHS)
}
