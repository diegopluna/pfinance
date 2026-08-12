# Balances and net worth are derived from the transaction ledger

The MVP needs net worth charts, which require account balances. We decided each Account has an opening balance, and its current balance is derived as `opening balance + sum of its transactions`; net worth is the sum of balances across the household's accounts (liabilities go negative). A plain "balance adjustment" transaction type is the escape hatch for when the ledger and reality drift (e.g. untracked investment gains).

## Considered Options

- **Derived from the ledger (chosen)** — one source of truth; accurate while the ledger is complete; poor fit for accounts whose value changes without transactions.
- **Manual balance snapshots** — periodic "checking: $X" entries charted over time; tolerates an incomplete ledger but decouples net worth from transactions and requires manual upkeep.
- **Both (derived + snapshots/reconciliation)** — most robust, most surface.

## Consequences

Post-MVP we intend to drift toward the third option: keeping derived balances but adding balance snapshots/reconciliation on top, so accounts like investments are first-class instead of being papered over with adjustment entries.

## Amendment: the liability sign is user-carried (issue #50)

"Liabilities go negative" is a convention the user carries, not a rule the system enforces. Debt is _entered_ as a negative amount — a credit card with 500 owed opens at −500 and spends negative — and every aggregate is a plain sum with no kind-based sign flip anywhere. Two enforcement options were considered and declined:

- **Flip by kind in aggregates** — would require debt to be stored positive, colliding with the ledger's signed amounts (an Expense _is_ a negative Transaction, on a credit card too) and double-negating every existing ledger.
- **Coerce the sign at the write boundary** — rejects real states (an overpaid card genuinely holds a positive Balance) and has no coherent meaning for Balance Adjustments.

Consequences: the API accepts either sign for any account type; a liability entered with a positive balance raises Net Worth by design; guiding the sign at entry is the UI's job (the account form nudges liability opening balances negative). Pinned in `apps/server/test/liability-sign.test.ts`.
