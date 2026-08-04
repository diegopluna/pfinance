import { createAuthClient } from 'better-auth/react'

// The server mounts Better Auth at /api/auth (the client's default basePath).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
})
