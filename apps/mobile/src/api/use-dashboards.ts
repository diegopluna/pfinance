import { call } from '@pfinance/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { connectedApi } from '@/api/client'
import { keys } from '@/api/query-keys'

// The three dashboards (issue #79). Every aggregate is computed server-side
// (issue #1) — these hooks fetch and cache, they never sum. All three drop
// `through`: a dashboard always reads up to the current month.

export function useNetWorth() {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.netWorth(),
    queryFn: () =>
      call(
        api.api['net-worth'].$get({ query: { through: undefined } }),
        'Could not load your Net Worth.',
      ),
    enabled,
  })
}

// The month is part of the key, so stepping refetches while months already
// visited come back instantly — and the previous month's bars hold while
// the next one loads, so a held-down stepper doesn't strobe.
export function useSpending(month: string) {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.spending(month),
    queryFn: () =>
      call(
        api.api['spending-by-category'].$get({ query: { month } }),
        'Could not load your spending.',
      ),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useIncomeExpense() {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.incomeExpense(),
    queryFn: () =>
      call(
        api.api['income-vs-expense'].$get({ query: { through: undefined } }),
        'Could not load income vs expense.',
      ),
    enabled,
  })
}
