-- Foundation migration. Creates the household-agnostic `meta` table and
-- records the ledger convention: money amounts are INTEGERs in minor units
-- (see docs/adr/0006-money-integer-minor-units.md). The /health endpoint
-- reads this row, so a passing health check proves migrations were applied.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO meta (key, value) VALUES ('ledger_amount_units', 'minor');
