# Sign-up gating: locked, bootstrap exception, invites bypass

pfinance is forked and self-hosted for one household, so self-serve sign-up (create a User and a new Household) is permanently locked — there is no switch to open it. Two deliberate exceptions:

1. **Bootstrap** — when zero Users exist, sign-up is always allowed; the first User becomes the first Household's owner. No seed scripts or env-var credentials.
2. **Invites** — an owner-issued Invite lets its recipient register even though sign-ups are off; issuing the invite is the consent. Without this, a locked-down instance could never become a multi-member household.

An earlier revision of this ADR specified a `SIGNUPS_ENABLED` env switch so a deployer could open registration. Dropped (2026-08-05): the open-multi-tenant persona doesn't exist for a self-hosted personal-finance app, and the switch was one more knob to document and misconfigure.

## Consequences

The bootstrap exception means a freshly deployed instance is claimable by whoever reaches it first — deployers should sign up immediately after deploying. Worth stating loudly in the self-hosting docs. Until invites land, every instance is single-User.
