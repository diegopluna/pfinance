// The tenancy-and-actor context every Ledger verb takes, resolved once per
// request by the session middleware in index.ts. A plain value for now; when
// scoped query builders arrive (the HouseholdScope deepening), they grow
// here without churning the verbs' signatures.
export interface Scope {
  householdId: string
  userId: string
}
