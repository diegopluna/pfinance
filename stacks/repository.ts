import { execSync } from 'node:child_process'

export interface Repository {
  readonly owner: string
  readonly repository: string
}

// Accepts the "owner/repo" slug form (GITHUB_REPOSITORY in GitHub Actions)
// or a git remote URL (SSH scp-like or https form).
export const parseRepository = (input: string): Repository | undefined => {
  const path = input.startsWith('git@')
    ? input.replace(/^git@[^:]+:/, '')
    : input.replace(/^https:\/\/[^/]+\//, '')
  const match = /^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(path)
  if (!match) return undefined
  return { owner: match[1], repository: match[2] }
}

const originRemoteUrl = (): string | undefined => {
  try {
    return execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return undefined
  }
}

// Resolves the repository the deploy is running against: GITHUB_REPOSITORY
// (set by GitHub Actions) wins, then the clone's origin remote. Undefined
// means "no GitHub repository configured" — callers decide whether that is
// an error (CI secrets bootstrap) or a reason to skip (PR preview comment).
export const detectRepository = (
  env: Record<string, string | undefined> = process.env,
  readOriginUrl: () => string | undefined = originRemoteUrl,
): Repository | undefined => {
  const fromEnv = env.GITHUB_REPOSITORY
  if (fromEnv !== undefined && fromEnv !== '') return parseRepository(fromEnv)
  const remote = readOriginUrl()
  return remote === undefined ? undefined : parseRepository(remote)
}
