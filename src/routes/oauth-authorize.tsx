import { useEffect, useRef, useState } from 'preact/hooks'
import { Link } from '../components/Router'
import * as api from '../api'
import type { ApiUser, OAuthAuthorizeContext } from '../api'
import '../account.css'

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

export function OAuthAuthorizeRoute() {
  const [loading, setLoading] = useState(true)
  const [ctx, setCtx] = useState<OAuthAuthorizeContext | null>(null)
  const [user, setUser] = useState<ApiUser | null>(null)
  const [clientId, setClientId] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'allow' | 'deny' | 'logout' | null>(null)
  const btnRef = useRef<HTMLDivElement>(null)

  const loadContext = async () => {
    if (typeof window === 'undefined') return
    setLoading(true)
    setError('')
    try {
      const data = await api.getOAuthAuthorize(window.location.search)
      setCtx(data)
      setUser(data.user)
      setClientId(data.googleClientId)
    } catch (e: any) {
      setError(e.message || 'Ungültige OAuth-Autorisierungsanfrage')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadContext()
  }, [])

  // Render Google Sign-In button when user is not yet authenticated
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
              const { user: loggedInUser } = await api.login(resp.credential)
              setUser(loggedInUser)
            } catch (e: any) {
              setError(e.message || 'Anmeldung fehlgeschlagen')
            }
          },
        })
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          locale: 'de',
        })
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [loading, user, clientId])

  const handleDecision = async (action: 'allow' | 'deny') => {
    if (!ctx?.params || busy) return
    setBusy(action)
    setError('')
    try {
      const p = ctx.params
      const res = await api.postOAuthAuthorize({
        client_id: p.clientId,
        redirect_uri: p.redirectUri,
        response_type: p.responseType,
        scope: p.scope,
        state: p.state,
        code_challenge: p.codeChallenge,
        code_challenge_method: p.codeChallengeMethod,
        nonce: p.nonce,
        action,
      })
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
      } else {
        throw new Error('Keine Weiterleitungs-URL vom Server erhalten')
      }
    } catch (e: any) {
      setBusy(null)
      setError(e.message || 'Autorisierung fehlgeschlagen')
    }
  }

  const handleSwitchAccount = async () => {
    if (busy) return
    setBusy('logout')
    setError('')
    try {
      await api.logout()
      setUser(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const clientHost = ctx?.client?.clientName || ctx?.client?.origin || 'Instanz'

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
            <button class="acc-btn secondary" onClick={handleSwitchAccount} disabled={busy !== null}>
              Konto wechseln
            </button>
          </div>
        )}
      </header>

      <main class="account-main">
        <h1>QuixPOS Anmeldung</h1>
        {error && (
          <p class="acc-msg error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p>Prüfe Autorisierungsanfrage …</p>
        ) : !ctx ? (
          <section class="acc-card">
            <h2>Ungültige Anfrage</h2>
            <p class="hint">
              Bitte starte die Anmeldung erneut von deiner QuixPOS-Instanz aus (fehlende oder ungültige{' '}
              <code>redirect_uri</code>).
            </p>
          </section>
        ) : !user ? (
          <section class="acc-card">
            <h2>Mit Google anmelden</h2>
            <p>
              Melde dich mit deinem Google-Konto bei QuixPOS an, um dich anschließend auf{' '}
              <strong>{clientHost}</strong> anzumelden.
            </p>
            <div ref={btnRef} style={{ margin: '1rem 0' }} />
            <p class="hint">
              Mit der Anmeldung akzeptierst du die <Link href="/terms">Nutzungsbedingungen</Link> und die{' '}
              <Link href="/privacypolicy">Datenschutzerklärung</Link>.
            </p>
          </section>
        ) : (
          <section class="acc-card">
            <h2>Anmeldung bei {clientHost}</h2>
            <p>
              Die Instanz <strong>{ctx.client.origin}</strong> möchte dein QuixPOS-Profil (verknüpft mit Google) zur
              Authentifizierung verwenden.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                margin: '1rem 0',
              }}
            >
              {user.picture && (
                <img
                  src={api.pictureSrc(user.picture)}
                  alt=""
                  width="40"
                  height="40"
                  style={{ borderRadius: '50%' }}
                />
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{user.email}</div>
                <div class="hint" style={{ margin: 0 }}>
                  Übermittelte Daten: E-Mail-Adresse, Profilbild & Benutzer-ID ({ctx.params.scope})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button
                class="acc-btn"
                onClick={() => handleDecision('allow')}
                disabled={busy !== null}
              >
                {busy === 'allow' ? 'Weiterleitung …' : `Als ${user.email} fortfahren`}
              </button>
              <button
                class="acc-btn secondary"
                onClick={() => handleDecision('deny')}
                disabled={busy !== null}
              >
                {busy === 'deny' ? 'Wird abgebrochen …' : 'Abbrechen'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default OAuthAuthorizeRoute

