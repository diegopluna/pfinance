// The Account type vocabulary (issue #7). An Account's type marks it as an
// asset or a liability so debt reads as debt in the UI — the LIABILITY badge
// and the account form's sign nudge. Net Worth itself never flips by kind:
// the sign is user-carried (ADR 0001, CONTEXT.md "Net Worth"). Kept free of
// drizzle imports so the web app can import this entry without pulling the
// ORM into its bundle.

// Each kind ends in a catch-all (issue #51) so an account that fits no
// finer label — a property, a gift-card balance, an IOU — still has a home.
export const ACCOUNT_TYPES = [
  { type: 'checking', label: 'Checking', kind: 'asset' },
  { type: 'savings', label: 'Savings', kind: 'asset' },
  { type: 'cash', label: 'Cash', kind: 'asset' },
  { type: 'investment', label: 'Investment', kind: 'asset' },
  { type: 'other_asset', label: 'Other asset', kind: 'asset' },
  { type: 'credit_card', label: 'Credit card', kind: 'liability' },
  { type: 'loan', label: 'Loan', kind: 'liability' },
  { type: 'other_liability', label: 'Other liability', kind: 'liability' },
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

const labelByType = new Map<string, string>(ACCOUNT_TYPES.map((entry) => [entry.type, entry.label]))

/**
 * True when the UI should annotate this type as a liability ("— liability",
 * "· liability") so debt reads as debt at a glance — false for asset types
 * and for the catch-all whose label already says it ("Other liability").
 * One predicate so the picker and the dashboard can never drift.
 */
export function needsLiabilityMarker(type: string): boolean {
  return kindByType.get(type) === 'liability' && !/liability/i.test(labelByType.get(type) ?? '')
}

/** asset | liability — the sign an Account's Balance carries in Net Worth. */
export function accountKind(type: AccountType): AccountKind {
  const kind = kindByType.get(type)
  if (kind === undefined) {
    throw new RangeError(`Unknown account type: "${type}"`)
  }
  return kind
}
