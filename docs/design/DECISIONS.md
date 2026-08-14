# Design decisions

Extracted from the mirrored design docs so agents don't have to read decisions out of prototype CSS. **The `.dc.html` files are authoritative** — if this file disagrees with them, they win and this file is stale.

Not mirrored, ours to edit. Re-check it after every sync.

## Chosen direction

`Dashboard.dc.html` offers four dashboard directions (`1a` grid classic, `1b` net-worth hero, `1c` spending first, `1d` dark). **`1b` is the one that was carried forward** — both `Core Screens.dc.html` ("rolled out in the 1b direction") and `Flows.dc.html` ("in the 1b direction") build on it.

`1b` leads with a net-worth headline (value, delta vs. previous month, area chart with a hover tooltip), then a three-column row: accounts list, income vs. expense, spending by category.

## Chart palette — the stock tokens are rejected

`Dashboard.dc.html` states the shadcn defaults **failed CVD (colour-vision-deficiency) validation** and proposes replacing `--chart-1` … `--chart-5`. The current values in `packages/ui/src/styles/globals.css` are the ones that failed. Treat replacing them as a decision already made, not an open question.

| Role                | Prototype var | Light                   | Dark                    |
| ------------------- | ------------- | ----------------------- | ----------------------- |
| Slot 1              | `--s1`        | `#2a78d6`               | `#3987e5`               |
| Slot 2              | `--s2`        | `#eb6834`               | `#d95926`               |
| Slot 3              | `--s3`        | `#1baf7a`               | `#199e70`               |
| Slot 4              | `--s4`        | `#eda100`               | `#c98500`               |
| Slot 5              | `--s5`        | `#e87ba4`               | `#d55181`               |
| Uncategorized       | `--sx`        | `#a1a1a1`               | `#737373`               |
| Income categories   | `--s7`        | `#4a3aa7`               | not specified           |
| Positive / gain     | `--good`      | `#006300`               | `#0ca30c`               |
| Error / critical    | `--crit`      | `#d03b3b`               | not specified           |
| Net-worth area fill | `--area`      | `rgba(42,120,214,0.08)` | `rgba(57,135,229,0.12)` |

Two things to carry over carefully:

**`--sx` and `--s7` are additional slots, not part of the five.** Uncategorized always renders in the neutral grey, and income categories (Salary) use the violet — deliberately outside the five spending slots "so no chart collision" (`Core Screens.dc.html`). Neither has an equivalent token in `globals.css` today.

**The prototypes are sRGB hex; the repo's tokens are OKLCH.** Converting is a real step. Don't eyeball it, and don't assume a converted value keeps the CVD property that was validated in the first place.

## Semantics the charts must honour

- **Spending, and income vs. expense, exclude Transfers and Balance Adjustments — "by definition"** (`Dashboard.dc.html`, `Core Screens.dc.html`). Every such card in the prototypes carries a visible footnote saying so.
- **Uncategorized is a first-class, honest state and is never hidden.** It appears as its own row in spending, with a count surfaced ("3 uncategorized transactions").
- **Transfers and Adjustments still appear in the ledger**, with a `TRANSFER` / `ADJUSTMENT` badge instead of a category chip and a muted, unsigned-looking amount.
- **Balances are derived** — opening balance plus the sum of the account's transactions, "nothing here is directly editable" (`Core Screens.dc.html`). Drift is corrected with a Balance Adjustment.
- **Liability accounts count negatively toward net worth** through their user-entered negative balances — the sign is user-carried, never flipped by kind (ADR 0001 amendment, issue #50) — and are badged `LIABILITY`. The 2d dialog's hint copy predates this and claims the app does the signing; the shipped form diverges deliberately until the design project picks up the reworded hint (raised on issue #50).
- **Currency is set once per household, at creation**, and is not editable afterwards.
- Money is right-aligned and uses `font-variant-numeric: tabular-nums` throughout.

## Shell

1280px frame. A 232px sidebar — logo, nav (Dashboard, Transactions, Accounts, Imports, Settings), household footer with initials avatar, name, and `BRL · 2 members`. Cards are 12px radius, 1px border, on a `--card` background.

## Flows

**Auth** (`Flows.dc.html`) covers the three ADR-0004 states: normal sign-in; the zero-users bootstrap where the first sign-up claims the instance, names the household and picks the currency; and the locked state once the instance is claimed, which points the visitor at an invite link. Sign-ups stay closed permanently — the `SIGNUPS_ENABLED` switch was dropped when ADR 0004 was revised (2026-08-05).

**CSV import** is three steps — upload (with per-account target and a list of past imports), map columns, then review. Review flags exact-match duplicates as skipped with a per-row "import anyway" override, skips unparseable rows with a visible error, and summarises before confirming. Imported rows land Uncategorized and remember their import, so reverting deletes exactly those transactions.

## Gaps

Real holes, not oversights on the mirror's part — resolve them in the design project, not by guessing:

- No dark values for `--s7` (income) or `--crit` (error). The only dark variant in the mirror is `1d`, which is the `1a` layout and uses neither.
- No mobile or tablet layouts. Every frame is 1280px wide. The mobile app was built to `MOBILE.md` in the meantime — proposed decisions, ours, waiting to be taken up by the design project.
- No focus, hover, disabled, or loading states; the prototypes are static.
- No empty states for any screen.
- No formal token file in the project — the values above were read out of prototype CSS.
