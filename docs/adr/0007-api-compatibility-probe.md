# A store-distributed client forces an API compatibility policy

The mobile companion app updates on the app stores' cadence; every self-hosted Server updates when its owner redeploys. The two ends of the API can skew in either direction, and skew must present as a designed state ("update your Server" / "update the app"), never a generic error. The contract:

- The Server exposes a public, unauthenticated `GET /api/meta` returning `{ "product": "pfinance", "apiVersion": <integer>, "serverVersion": "<string>" }`.
- `product` is the fixed string `"pfinance"` — it distinguishes a real Server from any other site that happens to answer 200 with JSON.
- `apiVersion` is a single integer, starting at 1, that bumps **only on breaking API changes** (removing or renaming a route or field, changing a field's type or meaning, tightening auth on an existing route). Additive changes — new routes, new optional fields — never bump it. The app ships knowing the range it supports and classifies the Server at connect time: below the range is "Server too old", above it is "app too old".
- `serverVersion` is informational only — surfaced in diagnostics and support conversations, never parsed by clients.
- Absence of the endpoint (a 404) is itself the "Server too old" signal: the probe ships no later than the Server release that adds mobile auth support, so a Server without it predates mobile support by construction.

## Considered Options

- **Public meta probe with an integer apiVersion (chosen)** — one round-trip with no credentials classifies the Server; a single integer is trivial to compare, and "bumps only on breaking changes" keeps it honest as a compatibility signal rather than a release counter.
- **Server-advertised minimum app version** — rejected: it inverts the knowledge. A self-hosted Server can't know which app builds exist (its owner doesn't track store releases), so the field would either lie or demand maintenance from every self-hoster. The app knows its own supported range; the Server only states what it is.
- **Semver or per-route capability negotiation** — more expressive, but the expressiveness has no consumer: the app needs exactly one decision (connect, or which side to update), and a range check over one integer answers it. Semver's minor/patch components would carry meaning nobody reads.
- **No probe (attempt sign-in and interpret failures)** — rejected: an auth failure can't distinguish "wrong password" from "incompatible Server", which is precisely the version-skew-as-generic-error experience this decision exists to prevent.

## Consequences

- Breaking API changes now carry a real cost — a bumped `apiVersion` strands every store-installed app outside its range until the user updates one side — so changes should be made additively where possible.
- The probe must stay public, sessionless, and shape-stable forever; moving it behind auth or changing its fields is itself a breaking change that old clients would misread as "not a pfinance Server".
- The endpoint must exist no later than the Server release that adds mobile auth support, so its absence cleanly means "predates mobile support". Shipping it earlier is safe — the app classifies by `apiVersion` range, not by presence alone — and is in fact how it lands: the probe precedes the rest of the mobile work.
- No offline write queue in the mobile app: compatibility is verified at connect time, and a queue replayed later could land on a Server whose `apiVersion` changed while the phone was offline. Writes require a connection and fail visibly; reads may serve from cache.
