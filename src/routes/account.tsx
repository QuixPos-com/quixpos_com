import { useEffect, useRef, useState } from 'preact/hooks'
import { Link } from '../components/Router'
import * as api from '../api'
import type { ApiUser, Instance, Subscription } from '../api'
import '../account.css'

declare global {
  interface Window {
    google?: any
  }
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google-Anmeldung konnte nicht geladen werden'))
    document.head.appendChild(s)
  })
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE')

export function AccountRoute() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<ApiUser | null>(null)
  const [clientId, setClientId] = useState<string>()
  const [sub, setSub] = useState<Subscription | null>(null)
  const [instance, setInstance] = useState<Instance | null>(null)
  const [dashfreeCreated, setDashfreeCreated] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [name, setName] = useState('')
  const [nameState, setNameState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle')
  const [busy, setBusy] = useState(false)
  const [fedcmBlocked, setFedcmBlocked] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem('quixpos_terms_accepted') === 'true'
    } catch {
      return false
    }
  })
  const btnRef = useRef<HTMLDivElement>(null)

  const onToggleTerms = (checked: boolean) => {
    setAcceptedTerms(checked)
    setFedcmBlocked(false)
    try {
      if (checked) {
        localStorage.setItem('quixpos_terms_accepted', 'true')
        setError('')
      } else {
        localStorage.removeItem('quixpos_terms_accepted')
      }
    } catch {
      /* ignore */
    }
  }

  const onGoogleBtnClick = () => {
    if (!acceptedTerms) {
      setError('Bitte akzeptiere zuerst die Nutzungsbedingungen und die Datenschutzerklärung.')
      return
    }
    setError('')
    setFedcmBlocked(false)
    const roleBtn = btnRef.current?.querySelector<HTMLElement>('div[role="button"]')
    if (roleBtn) {
      roleBtn.click()
    } else {
      loadGsi()
        .then(() => {
          const btn = btnRef.current?.querySelector<HTMLElement>('div[role="button"]')
          if (btn) {
            btn.click()
          } else if (window.google?.accounts?.id?.prompt) {
            window.google.accounts.id.prompt((notification: any) => {
              const type = notification?.getMomentType?.()
              if (type === 'skipped' || type === 'dismissed') {
                setFedcmBlocked(true)
              }
            })
          }
        })
        .catch((e) => setError(e.message))
    }
  }

  const loadSubscription = async () => {
    const r = await api.getSubscription()
    setSub(r.subscription)
    setInstance(r.instance)
    setDashfreeCreated(Boolean(r.dashfreeCreated))
  }

  // Initial session check
  useEffect(() => {
    api
      .getMe()
      .then(async (r) => {
        setClientId(r.googleClientId)
        setUser(r.user)
        if (r.user) await loadSubscription()
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Google button (only loaded after terms are accepted)
  useEffect(() => {
    if (loading || user || !clientId || !acceptedTerms || !btnRef.current) return
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !btnRef.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          callback: async (resp: { credential: string }) => {
            try {
              setError('')
              const { user } = await api.login(resp.credential)
              setUser(user)
              await loadSubscription()
            } catch (e: any) {
              setError(e.message)
            }
          },
        })
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          locale: 'de',
          width: 300,
        })
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [loading, user, clientId, acceptedTerms])

  // Debounced name availability check
  useEffect(() => {
    if (!name) return setNameState('idle')
    if (!api.NAME_RE.test(name)) return setNameState('invalid')
    setNameState('checking')
    const t = setTimeout(() => {
      api
        .checkName(name)
        .then((r) => setNameState(r.available ? 'free' : 'taken'))
        .catch(() => setNameState('invalid'))
    }, 400)
    return () => clearTimeout(t)
  }, [name])

  // Poll instance provisioning until everything is done (only for paid tier; free tier uses dash.quixpos.com)
  const provisioning =
    sub?.tier !== 'free' &&
    instance &&
    !(instance.domainstate === 'ready' && instance.certstate === 'ready' && instance.dockerstate === 'running')
  useEffect(() => {
    if (!sub || !provisioning) return
    const id = setInterval(() => {
      api
        .getInstance()
        .then((r) => r.instance && setInstance(r.instance))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [sub, provisioning])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const onBook = (e: Event) => {
    e.preventDefault()
    run(async () => {
      const r = await api.bookFree(name)
      setSub(r.subscription)
      setInstance(r.instance)
      setDashfreeCreated(Boolean(r.dashfreeCreated))
    })
  }

  const onExtend = () =>
    run(async () => {
      const r = await api.extendSubscription()
      setInfo(r.message)
      await loadSubscription()
    })

  const onLogout = () =>
    run(async () => {
      await api.logout()
      setUser(null)
      setSub(null)
      setInstance(null)
    })

  const nameHint = {
    idle: '3–63 Zeichen: Kleinbuchstaben, Ziffern, Bindestriche (nicht am Anfang/Ende).',
    checking: 'Prüfe Verfügbarkeit …',
    free: 'Name ist verfügbar.',
    taken: 'Name ist bereits vergeben.',
    invalid: 'Ungültiger Name.',
  }[nameState]

  return (
    <div class="account-page">
      <header class="account-header">
        <Link class="logo" href="/">
          <span class="logo-mark" aria-hidden="true" />
          QuixPOS
        </Link>
        {user && (
          <div class="account-user">
            {user.picture && <img src={api.pictureSrc(user.picture)} alt="" width="32" height="32" />}
            <span>{user.email}</span>
            <button class="acc-btn secondary" onClick={onLogout} disabled={busy}>
              Abmelden
            </button>
          </div>
        )}
      </header>

      <main class="account-main">
        <h1>Mein Konto</h1>
        {error && <p class="acc-msg error" role="alert">{error}</p>}
        {info && <p class="acc-msg ok">{info}</p>}

        {loading ? (
          <p>Lade …</p>
        ) : !user ? (
          <section class="acc-card">
            <h2>Anmelden</h2>
            <p>Melde dich mit deinem Google-Konto an, um deine Kasse zu buchen.</p>
            <div style={{ margin: '1.25rem 0 1rem' }}>
              <button
                type="button"
                class="acc-btn-google"
                disabled={!acceptedTerms || busy}
                onClick={onGoogleBtnClick}
              >
                <svg class="acc-google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Mit Google anmelden</span>
              </button>
              <div ref={btnRef} class="acc-google-hidden" aria-hidden="true" />
            </div>
            <label class="acc-terms-label">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => onToggleTerms((e.target as HTMLInputElement).checked)}
              />
              <span>
                Ich akzeptiere die <Link href="/terms" target="_blank">Nutzungsbedingungen</Link> und die{' '}
                <Link href="/privacypolicy" target="_blank">Datenschutzerklärung</Link>.
              </span>
            </label>
            {fedcmBlocked && (
              <div class="acc-msg warning" style={{ marginTop: '1rem', textAlign: 'left', fontSize: '0.9rem' }}>
                <strong>Hinweis zur Google-Anmeldung:</strong>
                <p style={{ margin: '0.35rem 0 0' }}>
                  Die Anmeldung wurde vom Browser blockiert (Drittanbieter-Anmeldung / FedCM deaktiviert oder vorübergehend pausiert).
                  Du kannst die Drittanbieter-Anmeldung über das Symbol links neben der Adressleiste (oder in den Browser-Website-Einstellungen) erlauben.
                </p>
              </div>
            )}
          </section>
        ) : sub ? (
          <>
            <section class="acc-card">
              <h2>Abonnement</h2>
              <p>
                Tarif: <strong>{sub.tier}</strong> · gültig bis <strong>{fmtDate(sub.validUntil)}</strong>
              </p>
              <button
                class="acc-btn"
                onClick={onExtend}
                disabled={busy || !api.isExtendEligible(sub.validUntil)}
                title="Verlängerung ist 3 Monate vor Ablauf möglich"
              >
                Um 6 Monate verlängern
              </button>
            </section>
            {sub.tier === 'free' || dashfreeCreated ? (
              <section class="acc-card">
                <h2>Instanz: "dash.quixpos.com"</h2>
                <p>Account "{user?.email}"</p>
                <p>
                  <a
                    class="acc-btn secondary"
                    href="https://dash.quixpos.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', textDecoration: 'none', marginTop: '0.5rem' }}
                  >
                    dash.quixpos.com öffnen
                  </a>
                </p>
              </section>
            ) : instance ? (
              <section class="acc-card">
                <h2>Instanz: {instance.name}</h2>
                <ul class="acc-states">
                  <li>Domain: <span class={`pill ${instance.domainstate}`}>{instance.domainstate}</span></li>
                  <li>Zertifikat: <span class={`pill ${instance.certstate}`}>{instance.certstate}</span></li>
                  <li>Docker: <span class={`pill ${instance.dockerstate}`}>{instance.dockerstate}</span></li>
                </ul>
                {provisioning && <p class="hint">Wird eingerichtet – Status wird automatisch aktualisiert.</p>}
              </section>
            ) : null}
          </>
        ) : (
          <section class="acc-card">
            <h2>Kostenlos testen (6 Monate)</h2>
            <form onSubmit={onBook}>
              <label for="inst-name">Name deiner Instanz</label>
              <input
                id="inst-name"
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value.toLowerCase())}
                placeholder="mein-laden"
                autocomplete="off"
              />
              <p class={`hint ${nameState}`}>{nameHint}</p>
              <button class="acc-btn" type="submit" disabled={busy || nameState !== 'free'}>
                Kostenlos buchen
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

export default AccountRoute

