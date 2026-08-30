// Seeds the demo Server (issue #85) with a plausible Household, entirely
// through the public HTTP API — the same surface the apps use, so the seed
// can never write state the product couldn't. Run against a FRESH deploy:
// the first sign-up is the bootstrap claim (ADR 0004), which is also what
// makes the nightly destroy → deploy → seed cycle self-healing — even a
// visitor who changed the demo password is reset with everything else.
//
//   DEMO_API_URL=https://… node scripts/seed-demo.mjs
//
// DEMO_EMAIL / DEMO_PASSWORD default to the values embedded in the mobile
// app (apps/mobile/src/connect/demo.ts); override both together or neither.

const apiUrl = (process.env.DEMO_API_URL ?? '').replace(/\/+$/, '')
const email = process.env.DEMO_EMAIL ?? 'demo@example.com'
const password = process.env.DEMO_PASSWORD ?? 'try-the-demo'

if (apiUrl === '') {
  console.error(
    'DEMO_API_URL is not set. Deploy the demo stage first (vpx alchemy deploy --stage demo --yes),\n' +
      'then pass its apiUrl — in CI this is the DEMO_API_URL repository Actions variable\n' +
      '(docs/demo-server.md).',
  )
  process.exit(1)
}

let cookie = ''

const request = async (method, path, body) => {
  const response = await fetch(apiUrl + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie === '' ? {} : { cookie }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`)
  }
  return text === '' ? {} : JSON.parse(text)
}

// --- Claim the fresh instance (bootstrap sign-up) ---------------------------

const signUp = await fetch(apiUrl + '/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Demo',
    email,
    password,
    householdName: 'The Demo Household',
    currency: 'USD',
  }),
})
if (!signUp.ok) {
  throw new Error(
    `Bootstrap sign-up failed (${signUp.status}): ${(await signUp.text()).slice(0, 300)} — ` +
      'the demo stage must be freshly deployed (zero Users) before seeding.',
  )
}
// Better Auth sets the session cookie on the sign-up response.
cookie = (signUp.headers.getSetCookie?.() ?? [signUp.headers.get('set-cookie') ?? ''])
  .map((entry) => entry.split(';')[0])
  .filter(Boolean)
  .join('; ')
if (cookie === '') throw new Error('Sign-up succeeded but no session cookie came back.')

// --- Accounts ---------------------------------------------------------------

const makeAccount = async (name, type, openingBalance) =>
  (await request('POST', '/api/accounts', { name, type, openingBalance })).account.id

const checking = await makeAccount('Everyday checking', 'checking', 231548)
const savings = await makeAccount('Savings', 'savings', 1250000)
// A liability's Balance is user-carried negative (ADR 0001).
const card = await makeAccount('Credit card', 'credit_card', -48231)

// --- Categories (seeded at Household creation; look ids up by name) ---------

const { categories } = await request('GET', '/api/categories')
const categoryId = Object.fromEntries(categories.map((row) => [row.name, row.id]))
// A missing name would seed as Uncategorized silently (categoryId
// undefined parses as null) — fail loudly instead if the vocabulary drifts.
for (const name of [
  'Groceries',
  'Rent',
  'Utilities',
  'Transport',
  'Dining Out',
  'Entertainment',
  'Health',
  'Shopping',
  'Subscriptions',
  'Travel',
  'Salary',
]) {
  if (categoryId[name] === undefined) {
    throw new Error(`Seed category "${name}" is missing — the server's SEED_CATEGORIES changed.`)
  }
}

// --- Five months of ledger -------------------------------------------------
// Deterministic pseudo-randomness: the demo looks organic but two seed runs
// produce the same Household, which keeps screenshots and review notes valid.

let prngState = 0x9e3779b9
const random = () => {
  prngState = (prngState + 0x6d2b79f5) | 0
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (low, high) => Math.round(low + (high - low) * random())

const today = new Date()
const iso = (year, monthIndex, day) =>
  new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)

const transactions = []
const transfers = []

for (let monthsBack = 4; monthsBack >= 0; monthsBack--) {
  const year = today.getUTCFullYear()
  const monthIndex = today.getUTCMonth() - monthsBack
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  // The current month is only partly lived-in.
  const lastDay = monthsBack === 0 ? Math.max(2, today.getUTCDate() - 1) : daysInMonth
  const on = (day) => iso(year, monthIndex, Math.min(day, lastDay))
  const lived = (day) => day <= lastDay

  transactions.push({
    accountId: checking,
    date: on(1),
    amount: 512500,
    description: 'Salary',
    categoryId: categoryId.Salary,
  })
  if (lived(3))
    transactions.push({
      accountId: checking,
      date: on(3),
      amount: -185000,
      description: 'Rent',
      categoryId: categoryId.Rent,
    })
  if (lived(8))
    transactions.push({
      accountId: checking,
      date: on(8),
      amount: -between(11000, 17800),
      description: 'Electricity & internet',
      categoryId: categoryId.Utilities,
    })
  for (const day of [2, 6, 11, 16, 21, 27]) {
    if (!lived(day)) continue
    transactions.push({
      accountId: card,
      date: on(day),
      amount: -between(4200, 16800),
      description: ['Market run', 'Groceries', 'Supermarket', 'Corner store'][
        Math.floor(random() * 4)
      ],
      categoryId: categoryId.Groceries,
    })
  }
  for (const day of [5, 13, 19, 26]) {
    if (!lived(day)) continue
    transactions.push({
      accountId: card,
      date: on(day),
      amount: -between(2800, 9600),
      description: ['Lunch out', 'Pizza night', 'Coffee & pastries', 'Dinner for two'][
        Math.floor(random() * 4)
      ],
      categoryId: categoryId['Dining Out'],
    })
  }
  for (const day of [4, 9, 15, 22, 28]) {
    if (!lived(day)) continue
    transactions.push({
      accountId: checking,
      date: on(day),
      amount: -between(500, 3400),
      description: ['Bus fare', 'Ride share', 'Fuel', 'Parking'][Math.floor(random() * 4)],
      categoryId: categoryId.Transport,
    })
  }
  if (lived(12))
    transactions.push({
      accountId: card,
      date: on(12),
      amount: -3999,
      description: 'Streaming bundle',
      categoryId: categoryId.Subscriptions,
    })
  if (lived(20))
    transactions.push({
      accountId: card,
      date: on(20),
      amount: -1299,
      description: 'Cloud storage',
      categoryId: categoryId.Subscriptions,
    })
  if (lived(14))
    transactions.push({
      accountId: card,
      date: on(14),
      amount: -between(3000, 12500),
      description: ['Cinema tickets', 'Concert', 'Board game night'][Math.floor(random() * 3)],
      categoryId: categoryId.Entertainment,
    })
  if (monthsBack % 2 === 0 && lived(17))
    transactions.push({
      accountId: card,
      date: on(17),
      amount: -between(5500, 24000),
      description: ['New running shoes', 'Kitchenware', 'Winter coat'][Math.floor(random() * 3)],
      categoryId: categoryId.Shopping,
    })
  if (monthsBack === 3)
    transactions.push({
      accountId: checking,
      date: on(10),
      amount: -68000,
      description: 'Weekend trip',
      categoryId: categoryId.Travel,
    })
  if (monthsBack === 1)
    transactions.push({
      accountId: checking,
      date: on(23),
      amount: -15750,
      description: 'Dentist',
      categoryId: categoryId.Health,
    })

  if (lived(2))
    transfers.push({
      fromAccountId: checking,
      toAccountId: savings,
      amount: 100000,
      date: on(2),
      description: 'Monthly savings',
    })
  if (lived(25))
    transfers.push({
      fromAccountId: checking,
      toAccountId: card,
      amount: between(42000, 68000),
      date: on(25),
      description: 'Card payment',
    })
}

// A couple of fresh Uncategorized rows so the cleanup flow has something to
// demo — the honest state of a ledger that just got new activity.
transactions.push(
  {
    accountId: card,
    date: iso(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    amount: -2350,
    description: 'POS 4417 COFFEE',
    categoryId: null,
  },
  {
    accountId: checking,
    date: iso(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    amount: -8900,
    description: 'TRANSF 8821 MKT',
    categoryId: null,
  },
)

for (const entry of transactions) await request('POST', '/api/transactions', entry)
for (const entry of transfers) await request('POST', '/api/transfers', entry)

console.log(
  `Seeded the demo Household at ${apiUrl}: 3 accounts, ` +
    `${transactions.length} transactions, ${transfers.length} transfers.`,
)
