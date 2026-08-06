import { account, transaction, type Db } from '@pfinance/db'
import { asc, eq, sql } from 'drizzle-orm'

// The monthly Net Worth series (issue #17): the sum of all Account Balances
// at each month's end, derived entirely from the ledger (ADR 0001) and
// computed server-side — the web app renders, it never sums (issue #1).
//
// No sign flip on liabilities: the ledger convention stores debt as a
// negative Balance (a credit card opens in debt with a negative opening
// balance and spends negative — pinned in accounts.test.ts), so a liability
// Account already contributes negatively to the plain sum. Flipping by kind
// would double-negate and make debt raise Net Worth.

export interface NetWorthPoint {
  month: string
  netWorth: number
}

// A calendar month is the `YYYY-MM` prefix of a Transaction's calendar date,
// so bucketing is pure string slicing: no Date is ever constructed and no
// timezone can shift a Transaction across a month boundary — a purchase on
// the 1st lands in its own month (issue #1 story 48).
const CALENDAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const isCalendarMonth = (value: unknown): value is string =>
  typeof value === 'string' && CALENDAR_MONTH.test(value)

// The chart's default right edge. UTC is a deliberate pick of *some* fixed
// zone for "which month is it": ledger data itself carries no timezone.
export const currentUtcMonth = () => new Date().toISOString().slice(0, 7)

// Month arithmetic on YYYY-MM strings — shared with the income-expense
// aggregate, so every chart steps months the same way.
export const addMonths = (month: string, delta: number): string => {
  const zeroBased = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta
  const year = Math.floor(zeroBased / 12)
  const monthNumber = (zeroBased % 12) + 1
  return `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`
}

// Safety valve, not pagination: a mistyped year (0206-01-05 is a valid
// calendar date) must not balloon the response. The most recent window wins;
// cutting older months cannot skew the values because the cumulative sum
// still accumulates from the ledger's true start.
const MAX_SERIES_MONTHS = 1200

// The series spans the ledger: from the earliest Transaction's month through
// `through` (or the latest Transaction's month, when the ledger runs past
// it — a future-dated entry extends the line rather than vanishing from its
// end). Months with no Transactions still get a point, so the line is flat
// through them instead of skipping.
export const monthlyNetWorthSeries = async (
  db: Db,
  householdId: string,
  through: string,
): Promise<NetWorthPoint[]> => {
  // Every Account counts, archived included: archiving hides an Account from
  // the UI without losing history (issue #7), and a series that dropped a
  // closed Account's Transactions would rewrite the past.
  const accounts = await db
    .select({ openingBalance: account.openingBalance })
    .from(account)
    .where(eq(account.householdId, householdId))
  if (accounts.length === 0) return []

  const monthExpr = sql<string>`substr(${transaction.date}, 1, 7)`
  const deltas = await db
    .select({
      month: monthExpr,
      delta: sql<number>`sum(${transaction.amount})`.mapWith(Number),
    })
    .from(transaction)
    .innerJoin(account, eq(account.id, transaction.accountId))
    .where(eq(account.householdId, householdId))
    .groupBy(monthExpr)
    .orderBy(asc(monthExpr))

  // Lexicographic comparison IS chronological for YYYY-MM strings.
  const deltaByMonth = new Map(deltas.map((row) => [row.month, row.delta]))
  const start = deltas[0]?.month ?? through
  const lastLedgerMonth = deltas.at(-1)?.month ?? through
  const end = lastLedgerMonth > through ? lastLedgerMonth : through

  // Opening balances have no date — they exist from before the ledger's
  // first month, so they seed the running sum.
  let netWorth = accounts.reduce((sum, row) => sum + row.openingBalance, 0)
  const points: NetWorthPoint[] = []
  for (let month = start; month <= end; month = addMonths(month, 1)) {
    netWorth += deltaByMonth.get(month) ?? 0
    points.push({ month, netWorth })
  }
  return points.slice(-MAX_SERIES_MONTHS)
}
