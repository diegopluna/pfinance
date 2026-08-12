# Better Auth with email+password only; no email anywhere in the MVP

Authentication uses Better Auth on the Hono worker with D1, with email+password as the sole method. The driving constraint is the fork-and-deploy story: email+password works on any Cloudflare account with zero third-party setup, whereas social logins need per-deployer OAuth apps and anything email-based needs a mail provider. Cloudflare Access was rejected because it outsources identity to the deployer's Zero Trust config and fights the in-app Member/Invite model; hand-rolled sessions were rejected as needless risk.

## Session lifetime

Sessions use Better Auth's defaults deliberately (issue #54): a 7-day expiry that rolls forward on activity (refreshed at most once a day — `updateAge` is 1 day), so a visit on any later day extends the session another 7 days. User story 17's "persists across visits until I sign out" holds for its motivating case — frictionless daily logging — since anyone who visits at least weekly is never re-prompted. The flip side is accepted: an absence longer than 7 days signs the user out. We prefer that bound over a months-long `session.expiresIn` because it keeps stale sessions short-lived on shared devices at zero configuration cost, and passing no `session` config means fork-and-deploy instances track Better Auth's tuning without us re-litigating it. Signing out revokes the session server-side — the cookie is dead even if a copy survives.

## Consequences

No email verification and no password reset in the MVP — both require a mail provider, which would be one more thing every forker must configure. On a self-hosted instance, "forgot password" is solved by the deployer resetting via the database. Post-MVP, email becomes an optional env-configured integration that unlocks verification, reset, and emailed Invites (MVP Invites are copy-paste links).
