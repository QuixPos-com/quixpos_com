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
            window.google.accounts.id.prompt()
          }
        })
        .catch((e) => setError(e.message))
    }
  }

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

  // Render Google Sign-In button when user is not yet authenticated (only after terms are accepted)
  useEffect(() => {
    if (loading || user || !clientId || !acceptedTerms || !btnRef.current) return
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
          width: 300,
        })
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [loading, user, clientId, acceptedTerms])

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
            <div style={{ margin: '1.25rem 0 1rem' }}>
              <button
                type="button"
                class="acc-btn-google"
                disabled={!acceptedTerms || busy !== null}
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
              {acceptedTerms && (
                <div
                  ref={btnRef}
                  style={{ position: 'fixed', top: -9999, left: -9999, width: 250, height: 44, pointerEvents: 'none' }}
                  aria-hidden="true"
                />
              )}
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

