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
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [name, setName] = useState('')
  const [nameState, setNameState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle')
  const [busy, setBusy] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)

  const loadSubscription = async () => {
    const r = await api.getSubscription()
    setSub(r.subscription)
    setInstance(r.instance)
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

  // Google button
  useEffect(() => {
    if (loading || user || !clientId || !btnRef.current) return
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !btnRef.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
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
        window.google.accounts.id.renderButton(btnRef.current, { theme: 'outline', size: 'large', locale: 'de' })
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [loading, user, clientId])

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

  // Poll instance provisioning until everything is done
  const provisioning =
    instance && !(instance.domainstate === 'ready' && instance.certstate === 'ready' && instance.dockerstate === 'running')
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
            <div ref={btnRef} />
            <p class="hint">
              Mit der Anmeldung akzeptierst du die <Link href="/terms">Nutzungsbedingungen</Link> und
              die <Link href="/privacypolicy">Datenschutzerklärung</Link>.
            </p>
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
            {instance && (
              <section class="acc-card">
                <h2>Instanz: {instance.name}</h2>
                <ul class="acc-states">
                  <li>Domain: <span class={`pill ${instance.domainstate}`}>{instance.domainstate}</span></li>
                  <li>Zertifikat: <span class={`pill ${instance.certstate}`}>{instance.certstate}</span></li>
                  <li>Docker: <span class={`pill ${instance.dockerstate}`}>{instance.dockerstate}</span></li>
                </ul>
                {provisioning && <p class="hint">Wird eingerichtet – Status wird automatisch aktualisiert.</p>}
              </section>
            )}
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

