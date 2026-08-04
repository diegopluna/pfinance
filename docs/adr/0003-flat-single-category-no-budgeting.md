# Flat single-Category Transactions; budgeting is out of the MVP

Categories are a flat household-owned list (seeded with defaults at Household creation), and each Transaction carries exactly one Category or is Uncategorized — no hierarchy, no splits. Envelope-style budgeting is deliberately absent from the MVP: pfinance v1 reports where money went, it does not plan where it may go, so the word "Budget" appears nowhere in the domain language.

## Consequences

Post-MVP we intend to drift toward transaction splits (one Transaction spanning multiple category portions). Category hierarchy and budgeting may follow later; nothing in the MVP should preclude them, but nothing accommodates them either.
