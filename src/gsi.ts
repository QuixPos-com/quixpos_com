declare global {
  interface Window {
    google?: any
    _quixpos_gsi_initialized?: boolean
  }
}

let activeAuthCallback: ((credential: string) => Promise<void> | void) | null = null
let onFedcmBlockedCallback: (() => void) | null = null
let isUserActionActive = false
let userActionTimer: any = null
let fedcmInterceptorInstalled = false

export function setupFedcmInterceptor() {
  if (typeof window === 'undefined' || fedcmInterceptorInstalled) return
  if (!navigator?.credentials?.get) return
  fedcmInterceptorInstalled = true

  const origGet = navigator.credentials.get.bind(navigator.credentials)
  navigator.credentials.get = async function (options?: any) {
    try {
      return await origGet(options)
    } catch (err: any) {
      // Check if this was a user-initiated FedCM sign-in call
      // Google Identity Services passes { identity: { providers: [ ... ] } } for real credential requests,
      // while mode-support probes pass { identity: { mode: ... } } without providers.
      const isFedcmCall = Boolean(options && 'identity' in options && options.identity?.providers)
      if (isFedcmCall && isUserActionActive) {
        onFedcmBlockedCallback?.()
      }
      throw err
    }
  }
}

export function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve()
    setupFedcmInterceptor()
    if (window.google?.accounts?.id) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google-Anmeldung konnte nicht geladen werden'))
    document.head.appendChild(s)
  })
}

export function registerAuthCallback(callback: ((credential: string) => Promise<void> | void) | null) {
  activeAuthCallback = callback
}

export function markUserActionStart(onBlocked?: () => void) {
  isUserActionActive = true
  if (onBlocked) {
    onFedcmBlockedCallback = onBlocked
  }
  if (userActionTimer) clearTimeout(userActionTimer)
  userActionTimer = setTimeout(() => {
    isUserActionActive = false
  }, 10000)
}

export function clearUserAction() {
  isUserActionActive = false
  if (userActionTimer) clearTimeout(userActionTimer)
}

export function initAndRenderGsiButton(
  clientId: string,
  container: HTMLElement,
  onCredential: (credential: string) => Promise<void> | void,
) {
  if (typeof window === 'undefined' || !window.google?.accounts?.id) return
  registerAuthCallback(onCredential)

  if (!window._quixpos_gsi_initialized) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      use_fedcm_for_button: true,
      callback: (resp: { credential: string }) => {
        if (resp?.credential && activeAuthCallback) {
          activeAuthCallback(resp.credential)
        }
      },
    })
    window._quixpos_gsi_initialized = true
  }

  window.google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    locale: 'de',
    use_fedcm_for_button: true,
  })
}

