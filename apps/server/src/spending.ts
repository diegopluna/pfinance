import { account, category, transaction, type Db } from '@pfinance/db'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { ledgerAccountJoin, owned, type Scope } from './scope.ts'
import { derivedViewConditions } from './transactions.ts'

// Spending by Category for one calendar month (issue #18): the Expense view
// grouped by the Transaction's Category, computed server-side from the ledger
// — the web app renders, it never sums (issue #1). Only Expenses count:
// derivedViewConditions('expense') is the canonical predicate, so Transfer
// legs and Balance Adjustments are excluded here by the same definition the
// Transactions screen uses.

export interface SpendingSlice {
  // null is the Uncategorized slice — a state, not a Category (CONTEXT.md),
  // so the server invents no name for it; the web app labels it.
  categoryId: string | null
  name: string | null
  // Positive minor units: an Expense is stored negative, but a spending total
  // is a magnitude — the sign already did its job selecting the view.
  total: number
}

export const spendingByCategory = async (
  db: Db,
  scope: Scope,
  month: string,
): Promise<SpendingSlice[]> => {
  const total = sql<number>`sum(-${transaction.amount})`.mapWith(Number)
  return (
    db
      .select({
        categoryId: transaction.categoryId,
        name: category.name,
        total,
      })
      .from(transaction)
      .innerJoin(account, ledgerAccountJoin)
      // Left join: the Uncategorized bucket has no category row, and an
      // archived Category's history still names it (archiving retires a label
      // from assignment, not from the ledger).
      .leftJoin(category, eq(category.id, transaction.categoryId))
      .where(
        and(
          owned.ledger(scope),
          // Month bucketing is pure string slicing on the calendar date, the
          // net-worth convention: no Date, no timezone drift.
          eq(sql`substr(${transaction.date}, 1, 7)`, month),
          ...derivedViewConditions('expense'),
        ),
      )
      .groupBy(transaction.categoryId, category.name)
      // Largest slice first — the order a chart reads in — with the name
      // breaking ties and the Uncategorized slice after named ones.
      .orderBy(desc(total), sql`${category.name} is null`, asc(sql`lower(${category.name})`))
  )
}
