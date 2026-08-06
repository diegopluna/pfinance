import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// The recent window of per-month Income and Expense totals (issue #19),
// server-computed like every chart aggregate (issue #1). No through filter:
// the dashboard always reads up to the current month.
export function useIncomeExpense() {
  return useQuery({
    queryKey: ['income-vs-expense'],
    queryFn: async () => {
      const response = await api.api['income-vs-expense'].$get({ query: { through: undefined } })
      if (!response.ok) throw new Error('Failed to load income vs expense')
      return response.json()
    },
  })
}
