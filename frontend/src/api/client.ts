export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(`${status} ${code}`)
    this.status = status
    this.code = code
  }
}

/*
 * Whether the backend answers at all. A proxy in front of a stopped backend
 * (Vite, Caddy, Traefik) answers a 5xx that is not our JSON; the backend's own
 * errors are JSON, and mean it is up.
 */
let reachable = true
const listeners = new Set<() => void>()

function setReachable(next: boolean) {
  if (reachable === next) return
  reachable = next
  listeners.forEach((l) => l())
}

export const serverReachable = {
  get: () => reachable,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    })
  } catch (error) {
    // Aborted on purpose (an upload cancelled) says nothing about the server
    if (!(error instanceof DOMException && error.name === 'AbortError')) setReachable(false)
    throw error
  }
  const json = response.headers.get('Content-Type')?.includes('application/json') ?? false
  setReachable(response.status < 500 || json)

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
