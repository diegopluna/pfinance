# Sign-up gating: env switch, bootstrap exception, invites bypass

pfinance is forked and self-hosted, so registration policy is the deployer's choice via `SIGNUPS_ENABLED` (default `false` — secure for deployers who never read the docs). The switch gates only _self-serve_ sign-up (create a User and a new Household). Two deliberate exceptions:

1. **Bootstrap** — when zero Users exist, sign-up is always allowed; the first User becomes the first Household's owner. No seed scripts or env-var credentials.
2. **Invites** — an owner-issued Invite lets its recipient register even when sign-ups are off; issuing the invite is the consent. Without this, a locked-down instance could never become a multi-member household.

## Consequences

The bootstrap exception means a freshly deployed instance is claimable by whoever reaches it first — deployers should sign up immediately after deploying. Worth stating loudly in the self-hosting docs.
