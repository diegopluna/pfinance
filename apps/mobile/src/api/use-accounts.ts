import { call } from '@pfinance/api-client'
import { useQuery } from '@tanstack/react-query'
import { connectedApi } from '@/api/client'
import { keys } from '@/api/query-keys'

// The Household's Accounts with their server-derived Balances (ADR 0001).
// One cache entry per includeArchived flag, shared by the home screen, the
// Accounts screen, and the ledger forms — so a saved Transaction refreshes
// the Balances everywhere at once (api/query-keys.ts).
//
// The two flags are genuinely different questions: a list of Accounts to
// pick from is the active ones, while naming the Account an existing row
// sits on needs the archived ones too.
export function useAccounts(includeArchived: boolean) {
  const { api, enabled } = connectedApi()
  return useQuery({
    queryKey: keys.accounts(includeArchived),
    queryFn: () =>
      call(
        api.api.accounts.$get({ query: { includeArchived: includeArchived ? 'true' : 'false' } }),
        'Could not load your Accounts.',
      ),
    enabled,
  })
}
