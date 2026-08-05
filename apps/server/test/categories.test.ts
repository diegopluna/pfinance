import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import { expect } from 'vite-plus/test'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import {
  cookieHeader,
  executeWarm,
  freshApiUrl,
  signUpOwner,
  signUpRequest,
  test,
  trustedOrigin,
  withCookie,
} from './harness.ts'

// --- Category management (issue #10, ADR 0003) ---
// Every test mints Users, so each deploys a pristine instance through the
// scratch stack (see harness.ts). The seam is HTTP: the same /api/categories
// surface the web app consumes.
//
// Known coverage limit: the backfill branch for Households that predate
// seeding-at-creation can't be manufactured through this seam — every
// sign-up now seeds. It shares the deterministic-id insert with creation
// seeding, and the "seeded exactly once" assertions below pin the same
// idempotence the backfill relies on.

// The seed set in the order the API returns it (alphabetical, case-folded).
// Spelled out rather than imported from src so a change to the vocabulary
// has to be acknowledged here.
const SEED_NAMES = [
  'Dining Out',
  'Entertainment',
  'Groceries',
  'Health',
  'Rent',
  'Salary',
  'Shopping',
  'Subscriptions',
  'Transport',
  'Travel',
  'Utilities',
]

interface CategoryView {
  id: string
  name: string
  archivedAt: string | null
  createdAt: string
}

const readCategory = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { category: CategoryView }).category)

const readCategories = (response: HttpClientResponse) =>
  Effect.map(
    response.json,
    (body) => (body as unknown as { categories: CategoryView[] }).categories,
  )

const listCategories = (apiUrl: string, cookie: string, query = '') =>
  Test.executeWhenReady(
    HttpClientRequest.get(`${apiUrl}/api/categories${query}`).pipe(withCookie(cookie)),
  )

const createCategory = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/categories`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

const renameRequest = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  HttpClientRequest.patch(`${apiUrl}/api/categories/${id}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const renameCategory = (
  apiUrl: string,
  cookie: string,
  id: string,
  body: Record<string, unknown>,
) => Test.executeWhenReady(renameRequest(apiUrl, cookie, id, body))

type ArchiveAction = 'archive' | 'unarchive'

const archiveRequest = (apiUrl: string, cookie: string, id: string, action: ArchiveAction) =>
  HttpClientRequest.post(`${apiUrl}/api/categories/${id}/${action}`).pipe(
    trustedOrigin,
    withCookie(cookie),
  )

const archiveCategory = (apiUrl: string, cookie: string, id: string, action: ArchiveAction) =>
  Test.executeWhenReady(archiveRequest(apiUrl, cookie, id, action))

test.provider(
  'Categories: seeded at Household creation; add, rename, archive keep the list flat and whole',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Categories are Household data: no session, no access.
      const anonymous = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/categories`),
      )
      expect(anonymous.status).toBe(401)

      const owner = yield* signUpOwner(apiUrl, 'categories-owner@example.com', {
        householdName: 'Vocabulary House',
      })

      // A new Household starts with the seeded defaults, all active,
      // alphabetically ordered.
      const seeded = yield* readCategories(yield* listCategories(apiUrl, owner.cookie))
      expect(seeded.map((entry) => entry.name)).toEqual(SEED_NAMES)
      expect(seeded.every((entry) => entry.archivedAt === null)).toBe(true)

      // Add: a new label interleaves alphabetically with the seeds.
      const created = yield* createCategory(apiUrl, owner.cookie, { name: 'Pets' })
      expect(created.status).toBe(200)
      const pets = yield* readCategory(created)
      expect(pets.name).toBe('Pets')
      expect(pets.archivedAt).toBeNull()
      const withPets = yield* readCategories(yield* listCategories(apiUrl, owner.cookie))
      expect(withPets.map((entry) => entry.name)).toEqual(
        [...SEED_NAMES, 'Pets'].sort((a, b) => a.localeCompare(b)),
      )

      // Rename: the id survives, so history (and seeding-once, below) stick.
      const groceries = seeded.find((entry) => entry.name === 'Groceries')
      expect(groceries).toBeDefined()
      const renamed = yield* renameCategory(apiUrl, owner.cookie, groceries?.id ?? '', {
        name: 'Food & Groceries',
      })
      expect(renamed.status).toBe(200)
      const food = yield* readCategory(renamed)
      expect(food.id).toBe(groceries?.id)
      expect(food.name).toBe('Food & Groceries')

      // Archive: hidden from the default list, kept in history.
      const travel = seeded.find((entry) => entry.name === 'Travel')
      const archived = yield* archiveCategory(apiUrl, owner.cookie, travel?.id ?? '', 'archive')
      expect(archived.status).toBe(200)
      const archivedTravel = yield* readCategory(archived)
      expect(archivedTravel.archivedAt).not.toBeNull()

      // Re-archiving is an idempotent no-op: the original archivedAt must not
      // be rewritten. The sleep outlasts the second-precision timestamps so a
      // rewrite can't hide behind two calls landing in the same second.
      yield* Effect.sleep('1.5 seconds')
      const rearchived = yield* archiveCategory(apiUrl, owner.cookie, travel?.id ?? '', 'archive')
      expect(rearchived.status).toBe(200)
      expect((yield* readCategory(rearchived)).archivedAt).toEqual(archivedTravel.archivedAt)

      const defaultList = yield* readCategories(yield* listCategories(apiUrl, owner.cookie))
      expect(defaultList.some((entry) => entry.name === 'Travel')).toBe(false)
      const fullList = yield* readCategories(
        yield* listCategories(apiUrl, owner.cookie, '?includeArchived=true'),
      )
      expect(
        fullList.filter((entry) => entry.archivedAt !== null).map((entry) => entry.name),
      ).toEqual(['Travel'])

      // Seeding happened exactly once: after a rename and an archive, reading
      // again neither resurrects "Groceries" nor re-adds "Travel" — the list
      // is still the 11 seeds (one renamed, one archived) plus "Pets".
      expect(fullList).toHaveLength(SEED_NAMES.length + 1)
      expect(fullList.some((entry) => entry.name === 'Groceries')).toBe(false)

      // Unarchive brings a retired label back into the default list.
      const restored = yield* archiveCategory(apiUrl, owner.cookie, travel?.id ?? '', 'unarchive')
      expect(restored.status).toBe(200)
      expect((yield* readCategory(restored)).archivedAt).toBeNull()

      // Unknown Categories 404 on every mutation.
      expect(
        (yield* executeWarm(renameRequest(apiUrl, owner.cookie, 'missing', { name: 'X' }))).status,
      ).toBe(404)
      expect(
        (yield* executeWarm(archiveRequest(apiUrl, owner.cookie, 'missing', 'archive'))).status,
      ).toBe(404)

      // Validation: a Category's editable state is exactly a non-blank name.
      expect((yield* createCategory(apiUrl, owner.cookie, {})).status).toBe(400)
      expect((yield* createCategory(apiUrl, owner.cookie, { name: '   ' })).status).toBe(400)
      expect((yield* renameCategory(apiUrl, owner.cookie, pets.id, { name: '' })).status).toBe(400)
    }),
  { timeout: 600_000 },
)

test.provider(
  'Categories: the vocabulary is shared — an invited Member sees the seeds and edits them',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'vocab-owner@example.com')

      // Joining via Invite lands in the existing Household: no second seed
      // set is minted for the new Member.
      const invited = yield* Test.executeWhenReady(
        HttpClientRequest.post(`${apiUrl}/api/invites`).pipe(
          trustedOrigin,
          withCookie(owner.cookie),
          HttpClientRequest.bodyJsonUnsafe({}),
        ),
      )
      expect(invited.status).toBe(200)
      const { invite } = (yield* invited.json) as unknown as { invite: { token: string } }
      const joined = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'vocab-member@example.com', 'Vocab Member', {
          currency: null,
          inviteToken: invite.token,
        }),
      )
      expect(joined.status).toBe(200)
      const memberCookie = cookieHeader(joined)

      const memberList = yield* readCategories(yield* listCategories(apiUrl, memberCookie))
      expect(memberList.map((entry) => entry.name)).toEqual(SEED_NAMES)

      // The Member adds and archives in the shared vocabulary…
      const added = yield* readCategory(
        yield* createCategory(apiUrl, memberCookie, { name: 'Gifts' }),
      )
      const rent = memberList.find((entry) => entry.name === 'Rent')
      expect((yield* archiveCategory(apiUrl, memberCookie, rent?.id ?? '', 'archive')).status).toBe(
        200,
      )

      // …and the owner sees the same list: Gifts added, Rent archived, still
      // exactly one seed set.
      const ownerView = yield* readCategories(
        yield* listCategories(apiUrl, owner.cookie, '?includeArchived=true'),
      )
      expect(ownerView).toHaveLength(SEED_NAMES.length + 1)
      expect(ownerView.find((entry) => entry.id === added.id)?.name).toBe('Gifts')
      expect(ownerView.find((entry) => entry.name === 'Rent')?.archivedAt).not.toBeNull()
    }),
  { timeout: 600_000 },
)
