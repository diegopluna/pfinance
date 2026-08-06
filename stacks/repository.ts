import { execSync } from 'node:child_process'

export interface Repository {
  readonly owner: string
  readonly repository: string
}

// Accepts the "owner/repo" slug form (GITHUB_REPOSITORY in GitHub Actions)
// or a github.com remote URL (scp-like git@, ssh://, or https:// form).
// Remotes on other hosts yield undefined: a GitLab/Codeberg clone must not
// be mistaken for the github.com repository that shares its slug.
export const parseRepository = (input: string): Repository | undefined => {
  const url = /^(?:git@|(?:https|ssh):\/\/(?:git@)?)([^/:]+)[/:](.+)$/.exec(input)
  if (url !== null && url[1] !== 'github.com') return undefined
  const path = url === null ? input : url[2]
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
// A malformed explicit GITHUB_REPOSITORY throws instead: the skip path
// would tell the user to set the very variable they already set.
export const detectRepository = (
  env: Record<string, string | undefined> = process.env,
  readOriginUrl: () => string | undefined = originRemoteUrl,
): Repository | undefined => {
  const fromEnv = env.GITHUB_REPOSITORY
  if (fromEnv !== undefined && fromEnv !== '') {
    const parsed = parseRepository(fromEnv)
    if (parsed === undefined) {
      throw new Error(
        `GITHUB_REPOSITORY is set to ${JSON.stringify(fromEnv)} but the expected form is owner/repo.`,
      )
    }
    return parsed
  }
  const remote = readOriginUrl()
  return remote === undefined ? undefined : parseRepository(remote)
}
