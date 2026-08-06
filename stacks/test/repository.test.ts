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

test('returns undefined for input that is not a repository reference', () => {
  expect(parseRepository('')).toBeUndefined()
  expect(parseRepository('just-a-name')).toBeUndefined()
  expect(parseRepository('too/many/segments')).toBeUndefined()
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
