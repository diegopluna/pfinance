-- Idempotent seed, applied after migrations via the D1 resource's
-- importFiles. Records the ledger convention in the database itself
-- (docs/adr/0006-money-integer-minor-units.md).
INSERT OR REPLACE INTO meta (key, value) VALUES ('ledger_amount_units', 'minor');
