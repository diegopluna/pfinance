import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { call } from '@pfinance/api-client'
import { keys } from '@/lib/query-keys'

// The recent window of per-month Income and Expense totals (issue #19),
// server-computed like every chart aggregate (issue #1). No through filter:
// the dashboard always reads up to the current month.
export function useIncomeExpense() {
  return useQuery({
    queryKey: keys.incomeExpense(),
    queryFn: () =>
      call(
        api.api['income-vs-expense'].$get({ query: { through: undefined } }),
        'Failed to load income vs expense',
      ),
  })
}
