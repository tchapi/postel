export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(`${status} ${code}`)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })

  if (response.status === 401) {
    // The forward-auth session expired: a full reload goes back through the login portal.
    window.location.reload()
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(response.status, body.error ?? 'unknown')
  }

  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
