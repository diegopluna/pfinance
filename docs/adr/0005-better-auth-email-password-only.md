# Better Auth with email+password only; no email anywhere in the MVP

Authentication uses Better Auth on the Hono worker with D1, with email+password as the sole method. The driving constraint is the fork-and-deploy story: email+password works on any Cloudflare account with zero third-party setup, whereas social logins need per-deployer OAuth apps and anything email-based needs a mail provider. Cloudflare Access was rejected because it outsources identity to the deployer's Zero Trust config and fights the in-app Member/Invite model; hand-rolled sessions were rejected as needless risk.

## Consequences

No email verification and no password reset in the MVP — both require a mail provider, which would be one more thing every forker must configure. On a self-hosted instance, "forgot password" is solved by the deployer resetting via the database. Post-MVP, email becomes an optional env-configured integration that unlocks verification, reset, and emailed Invites (MVP Invites are copy-paste links).
