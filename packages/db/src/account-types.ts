// The Account type vocabulary (issue #7). An Account's type marks it as an
// asset or a liability so Net Worth can sign liabilities negatively (ADR
// 0001, CONTEXT.md "Net Worth"). Kept free of drizzle imports so the web app
// can import this entry without pulling the ORM into its bundle.

export const ACCOUNT_TYPES = [
  { type: 'checking', label: 'Checking', kind: 'asset' },
  { type: 'savings', label: 'Savings', kind: 'asset' },
  { type: 'cash', label: 'Cash', kind: 'asset' },
  { type: 'investment', label: 'Investment', kind: 'asset' },
  { type: 'credit_card', label: 'Credit card', kind: 'liability' },
  { type: 'loan', label: 'Loan', kind: 'liability' },
] as const satisfies readonly { type: string; label: string; kind: 'asset' | 'liability' }[]

export type AccountType = (typeof ACCOUNT_TYPES)[number]['type']
export type AccountKind = (typeof ACCOUNT_TYPES)[number]['kind']

// Non-empty tuple form for drizzle's text({ enum }) and validation.
export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((entry) => entry.type) as [
  AccountType,
  ...AccountType[],
]

const kindByType = new Map<string, AccountKind>(
  ACCOUNT_TYPES.map((entry) => [entry.type, entry.kind]),
)

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && kindByType.has(value)
}

/** asset | liability — the sign an Account's Balance carries in Net Worth. */
export function accountKind(type: AccountType): AccountKind {
  const kind = kindByType.get(type)
  if (kind === undefined) {
    throw new RangeError(`Unknown account type: "${type}"`)
  }
  return kind
}
