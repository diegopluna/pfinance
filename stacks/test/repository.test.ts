import { expect, test } from 'vite-plus/test'
import { detectRepository, parseRepository } from '../repository.ts'

// The deploy path derives the GitHub owner/repo from the environment so a
// fork deploys without editing source (issue #20). GITHUB_REPOSITORY is the
// "owner/repo" slug GitHub Actions sets on every run.

test('parses the owner/repo slug GitHub Actions provides', () => {
  expect(parseRepository('diegopluna/pfinance')).toEqual({
    owner: 'diegopluna',
    repository: 'pfinance',
  })
})

test('parses an HTTPS origin remote, with or without .git', () => {
  expect(parseRepository('https://github.com/someone/their-fork.git')).toEqual({
    owner: 'someone',
    repository: 'their-fork',
  })
  expect(parseRepository('https://github.com/someone/their-fork')).toEqual({
    owner: 'someone',
    repository: 'their-fork',
  })
})

test('parses an SSH origin remote, dropping the .git suffix', () => {
  expect(parseRepository('git@github.com:someone/their-fork.git')).toEqual({
    owner: 'someone',
    repository: 'their-fork',
  })
})

test('parses an ssh:// origin remote', () => {
  expect(parseRepository('ssh://git@github.com/someone/their-fork.git')).toEqual({
    owner: 'someone',
    repository: 'their-fork',
  })
})

test('returns undefined for input that is not a repository reference', () => {
  expect(parseRepository('')).toBeUndefined()
  expect(parseRepository('just-a-name')).toBeUndefined()
  expect(parseRepository('too/many/segments')).toBeUndefined()
})

// A remote on another forge must not be mistaken for a GitHub repository:
// stacks/github.ts would write CI secrets to whatever github.com repo
// happens to share the slug.
test('rejects remotes whose host is not github.com', () => {
  expect(parseRepository('git@gitlab.com:someone/their-fork.git')).toBeUndefined()
  expect(parseRepository('https://gitlab.com/someone/their-fork.git')).toBeUndefined()
  expect(parseRepository('ssh://git@codeberg.org/someone/their-fork.git')).toBeUndefined()
})

test('detection prefers GITHUB_REPOSITORY over the origin remote', () => {
  const repo = detectRepository(
    { GITHUB_REPOSITORY: 'env-owner/env-repo' },
    () => 'git@github.com:remote-owner/remote-repo.git',
  )
  expect(repo).toEqual({ owner: 'env-owner', repository: 'env-repo' })
})

test('detection falls back to the origin remote when the env var is unset', () => {
  const repo = detectRepository({}, () => 'https://github.com/remote-owner/remote-repo.git')
  expect(repo).toEqual({ owner: 'remote-owner', repository: 'remote-repo' })
})

test('detection returns undefined when no source yields a repository', () => {
  expect(detectRepository({}, () => undefined)).toBeUndefined()
})

// An explicit override that is wrong should fail loudly, not silently skip
// (the skip path would tell the user to set the very variable they set).
test('detection throws when GITHUB_REPOSITORY is set but malformed', () => {
  expect(() => detectRepository({ GITHUB_REPOSITORY: 'not a slug' }, () => undefined)).toThrow(
    /GITHUB_REPOSITORY/,
  )
})
