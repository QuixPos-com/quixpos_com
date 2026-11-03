export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) || '/api'

export interface ApiUser {
  id: number
  email: string
  picture?: string
}

export interface Subscription {
  id: number
  tier: string
  validUntil: string
}

export interface Instance {
  id?: number
  name: string
  domainstate: string
  certstate: string
  dockerstate: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || data?.message || `HTTP ${res.status}`)
  }
  return data as T
}

/** Works unauthenticated too: a 401 body still carries googleClientId. */
export async function getMe(): Promise<{ user: ApiUser | null; googleClientId?: string }> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  return { user: res.ok ? (data.user ?? null) : null, googleClientId: data.googleClientId }
}

export const login = (idToken: string) =>
  request<{ user: ApiUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ idToken }) })

export const logout = () => request<unknown>('/auth/logout', { method: 'POST' })

export const checkName = (name: string) =>
  request<{ name: string; available: boolean }>(`/instance/check-name?name=${encodeURIComponent(name)}`)

export const getSubscription = () =>
  request<{ subscription: Subscription | null; instance: Instance | null; dashfreeCreated?: boolean }>('/subscription')

export const bookFree = (name: string) =>
  request<{ subscription: Subscription; instance: Instance; dashfreeCreated?: boolean }>('/subscription', {
    method: 'POST',
    body: JSON.stringify({ tier: 'free', name }),
  })

export const extendSubscription = () =>
  request<{ message: string; subscription: Subscription }>('/subscription/extend', { method: 'POST' })

export const getInstance = () => request<{ instance: Instance | null }>('/instance')

export const NAME_RE = /^(?!-)[a-z0-9-]{3,63}(?<!-)$/

export const isExtendEligible = (validUntil: string) =>
  new Date(validUntil).getTime() - Date.now() <= 90 * 24 * 3600 * 1000


/** The backend returns the avatar as raw base64; turn it into a usable img src. */
export function pictureSrc(picture?: string): string | undefined {
  if (!picture) return undefined
  if (/^(data:|https?:|\/)/.test(picture)) return picture
  const mime = picture.startsWith('iVBOR')
    ? 'image/png'
    : picture.startsWith('R0lGOD')
      ? 'image/gif'
      : picture.startsWith('UklGR')
        ? 'image/webp'
        : 'image/jpeg'
  return `data:${mime};base64,${picture}`
}

