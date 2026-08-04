# Balances and net worth are derived from the transaction ledger

The MVP needs net worth charts, which require account balances. We decided each Account has an opening balance, and its current balance is derived as `opening balance + sum of its transactions`; net worth is the sum of balances across the household's accounts (liabilities go negative). A plain "balance adjustment" transaction type is the escape hatch for when the ledger and reality drift (e.g. untracked investment gains).

## Considered Options

- **Derived from the ledger (chosen)** — one source of truth; accurate while the ledger is complete; poor fit for accounts whose value changes without transactions.
- **Manual balance snapshots** — periodic "checking: $X" entries charted over time; tolerates an incomplete ledger but decouples net worth from transactions and requires manual upkeep.
- **Both (derived + snapshots/reconciliation)** — most robust, most surface.

## Consequences

Post-MVP we intend to drift toward the third option: keeping derived balances but adding balance snapshots/reconciliation on top, so accounts like investments are first-class instead of being papered over with adjustment entries.
