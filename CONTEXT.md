# pfinance

A self-hostable, Cloudflare-native personal finance app. The MVP is an expense tracker for individuals or households: manual and CSV-imported transactions, with charts for net worth and spending by category.

## Language

**Household**:
The tenant. All financial data (accounts, transactions, categories) belongs to a Household, never directly to a User. A solo user is a household-of-one.
_Avoid_: Family, group, workspace, organization

**Import**:
A revertible batch of Transactions created from one CSV file into exactly one Account: upload, map columns, preview, confirm. Rows exact-matching an existing Transaction of any kind (account + date + amount + description — Transfer legs match deliberately) or repeating an earlier row in the same file are flagged and skipped by default, each overridable per row; created Transactions remember their Import, and deleting an Import deletes them.
_Avoid_: Upload, sync

**Invite**:
A single-use, expiring link issued by a Household's owner that lets its recipient register as a Member — even when self-serve sign-up is disabled.
_Avoid_: Share link, referral

**Member**:
A User's membership in a Household. All members see and edit the household's shared Ledger; the owner can invite and remove members.
_Avoid_: Collaborator, participant

**Account**:
A financial account belonging to a Household (checking, credit card, cash, savings...). Has an opening balance; every Transaction belongs to exactly one Account.
_Avoid_: Wallet, bank (as a data concept); never use "account" for a User

**Category**:
A household-owned label for spending/income analysis, from a flat list seeded at Household creation and freely edited. Each Transaction has exactly one Category or is Uncategorized.
_Avoid_: Tag, label, budget line; no hierarchy or splits in the MVP

**Uncategorized**:
The state of a Transaction with no Category — the honest default for fresh CSV imports.
_Avoid_: Other, misc (as implicit dumping grounds)

**Currency**:
Chosen once per Household at creation; every Account and Transaction is denominated in it. There is no FX anywhere in the MVP.
_Avoid_: Per-account currency (post-MVP)

**Balance**:
An Account's opening balance plus the sum of its Transactions. Derived, never stored as editable state.
_Avoid_: Current amount

**Net Worth**:
The sum of Balances across a Household's Accounts. Liability accounts contribute negatively through their user-entered negative Balances — the sign is user-carried, never flipped by kind (ADR 0001).
_Avoid_: Total balance

**Ledger**:
A Household's complete record of Transactions across its Accounts — the single source from which every Balance and the Net Worth are derived. Written to by manual entry, Transfers, Balance Adjustments, and Imports.
_Avoid_: Journal, history, transaction log

**Transaction**:
A movement of money on exactly one Account, recorded manually or via CSV Import; carries a calendar date (never a timestamp) and a signed amount. The atom of the Ledger.
_Avoid_: Entry, record, expense (as the general term)

**Expense**:
A derived view: a negative-amount Transaction that is neither a Transfer leg nor a Balance Adjustment. Not a stored kind — direction lives in the signed amount.
_Avoid_: Spend, outgoing, debit

**Income**:
A derived view: a positive-amount Transaction that is neither a Transfer leg nor a Balance Adjustment.
_Avoid_: Earning, incoming, credit

**Transfer**:
A single entity linking an outflow Transaction on one Account to an inflow Transaction on another. Moves money between the Household's own Accounts; excluded from spending and income charts by definition.
_Avoid_: Payment (for card payoffs), two unlinked transactions

**Balance Adjustment**:
A Transaction whose only purpose is to correct drift between an Account's derived Balance and reality.
_Avoid_: Reconciliation (reserved for the richer post-MVP concept)

**User**:
A person who signs in. A User belongs to a Household as a Member and holds no financial data directly.
_Avoid_: Account (reserved for financial accounts)
