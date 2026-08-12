# Design reference

This directory mirrors the Claude Design project "pfinance" into the repo, so agents that can't reach claude.ai still get the visual source of truth from a checkout.

**The `.dc.html` files and `support.js` are written by a sync.** Don't hand-edit them — the next sync overwrites them. To change a design, change it in claude.ai/design and re-sync. `README.md` and `DECISIONS.md` are ours, not mirrored.

Start with **`DECISIONS.md`** — the decisions distilled out of the prototypes. The sync procedure and the project id live in `docs/agents/design.md`.

## Status

**Last full sync 2026-08-08.** `Flows.dc.html` was re-synced 2026-08-12 after its stale `SIGNUPS_ENABLED` copy was fixed at the source (issue #56); the other files were not re-fetched then. Four of the project's five files are mirrored:

| File                   | What it holds                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `Dashboard.dc.html`    | Four dashboard directions (`1a`–`1c`) plus a dark variant (`1d`). `1b` is the direction carried forward. |
| `Core Screens.dc.html` | Transactions list, add-transaction and new-account dialogs, Accounts, Settings (household + categories). |
| `Flows.dc.html`        | Sign-in, bootstrap sign-up, sign-ups-disabled, and the three-step CSV import.                            |
| `support.js`           | The Claude Design canvas runtime the `.dc.html` files load. Vendored so the previews render locally.     |

**Not mirrored:** `.thumbnail` — the project's preview image (base64 WebP). It carries no design decision, and hand-transcribed base64 corrupts, so it was skipped deliberately rather than committed broken.

## Viewing the previews

Open any `.dc.html` in a browser from this directory; each loads `./support.js` from alongside it. They are static canvas documents — no build step, no network.
