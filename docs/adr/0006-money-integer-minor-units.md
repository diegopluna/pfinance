# Money amounts are integers in minor units

Every money amount in the ledger — transaction amounts, opening balances, derived balances — is stored, transported, and computed as an `INTEGER` count of the Household currency's minor unit (cents for USD/EUR/BRL). Direction is the sign of the amount, per the CONTEXT.md definitions of Expense and Income. Conversion to major units happens only at the presentation edge, using the Household's currency to pick the minor-unit exponent.

## Considered Options

- **Integer minor units (chosen)** — exact arithmetic in SQLite and JS; sums, balances, and net worth are safe to compute anywhere; the single-currency-per-household decision (ADR 0002) means the unit is unambiguous within a ledger.
- **Floating point** — SQLite `REAL` / JS `number` arithmetic drifts on decimal fractions; unacceptable for a ledger whose balances are derived by summation (ADR 0001).
- **Decimal strings** — exact but excludes SQL-side aggregation (`SUM` over TEXT), which the derived-balance model relies on.

## Consequences

- CSV import (and any user input) must parse decimal strings into minor units at the boundary — never via float multiplication.
- Currencies with a non-2 minor-unit exponent (JPY: 0, BHD: 3) are handled by formatting metadata, not by the storage format.
- Recorded in the database itself: `meta.ledger_amount_units = 'minor'` (migration `0001_init.sql`), which `/health` reports.
