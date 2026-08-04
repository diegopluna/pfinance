# Single currency per Household

pfinance is meant to be forked and self-hosted anywhere, so currency is configurable — but in the MVP it is chosen once per Household, and every Account and Transaction is denominated in it. This keeps Balance and Net Worth honest sums with no FX rates, conversion timing, or mixed-currency Transfers. A foreign-currency holding can only be tracked as its household-currency equivalent, corrected with Balance Adjustments.

## Consequences

Post-MVP we intend to allow per-account currency (and eventually FX-aware net worth). Store amounts with the currency implied by the Household now; nothing should assume a globally hardcoded currency symbol or precision.
