import { useEffect, useRef, useState } from 'preact/hooks'
import { Link } from '../components/Router'
import * as api from '../api'
import type { ApiUser, Instance, Subscription, Tier } from '../api'
import { clearUserAction, initAndRenderGsiButton, loadGsi, markUserActionStart } from '../gsi'
import { mountSumUpCard, type SumUpCardInstance } from '../sumupWidget'
import '../account.css'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE')

const TIER_LABELS: Record<Tier, string> = {
  free: 'Geteilte Cloud-Instanz (Kostenlos)',
  cloud: 'Eigene Cloud-Instanz (9,90 € / Monat)',
  onprem: 'On-Premise (99 € einmalig)',
}

function readPlanFromQuery(): Tier | null {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search).get('plan')
  if (p === 'free' || p === 'cloud' || p === 'onprem') return p
  return null
}

function readCheckoutIdFromQuery(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('checkout_id')
}

interface ActiveCheckout {
  checkoutId: string
  plan: 'cloud' | 'onprem'
  amount: string
  recurring: boolean
}

export function AccountRoute() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<ApiUser | null>(null)
  const [clientId, setClientId] = useState<string>()
  const [sub, setSub] = useState<Subscription | null>(null)
  const [instance, setInstance] = useState<Instance | null>(null)
  const [sumupConfigured, setSumupConfigured] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Tier>(() => readPlanFromQuery() || 'free')
  const [showPlanPicker, setShowPlanPicker] = useState<boolean>(() => Boolean(readPlanFromQuery()))
  const [activeCheckout, setActiveCheckout] = useState<ActiveCheckout | null>(null)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
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
  const widgetRef = useRef<SumUpCardInstance | null>(null)

  const applySnapshot = (r: api.SubscriptionSnapshot) => {
    setSub(r.subscription)
    setInstance(r.instance)
    if (typeof r.sumupConfigured === 'boolean') {
      setSumupConfigured(r.sumupConfigured)
    }
  }

  const loadSubscription = async () => {
    const r = await api.getSubscription()
    applySnapshot(r)
    return r
  }

  const confirmAndApply = async (checkoutId: string, retries = 3) => {
    setConfirmingPayment(true)
    setError('')
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await api.confirmBillingCheckout(checkoutId)
        if (res.status === 'PAID') {
          if (res.subscription !== undefined) {
            applySnapshot({
              subscription: res.subscription ?? null,
              instance: res.instance ?? null,
              dashfreeCreated: res.dashfreeCreated,
              sumupConfigured: res.sumupConfigured,
            })
          } else {
            await loadSubscription()
          }
          setActiveCheckout(null)
          setShowPlanPicker(false)
          setInfo('Zahlung erfolgreich bestätigt. Dein Tarif ist jetzt aktiv.')
          return
        }
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500))
        }
      }
      setInfo('Zahlung wird noch verarbeitet. Bitte lade die Seite in wenigen Sekunden neu.')
    } catch (e: any) {
      setError(e.message || 'Zahlung konnte nicht bestätigt werden.')
    } finally {
      setConfirmingPayment(false)
    }
  }

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

  const handleLoginCredential = async (credential: string) => {
    try {
      setError('')
      setFedcmBlocked(false)
      const { user } = await api.login(credential)
      setUser(user)
      await loadSubscription()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const onGoogleBtnClick = () => {
    if (!acceptedTerms) {
      setError('Bitte akzeptiere zuerst die Nutzungsbedingungen und die Datenschutzerklärung.')
      return
    }
    setError('')
    setFedcmBlocked(false)
    markUserActionStart(() => setFedcmBlocked(true))

    const roleBtn = btnRef.current?.querySelector<HTMLElement>('div[role="button"]')
    if (roleBtn) {
      roleBtn.click()
    } else {
      loadGsi()
        .then(() => {
          if (clientId && btnRef.current) {
            initAndRenderGsiButton(clientId, btnRef.current, handleLoginCredential)
            setTimeout(() => {
              const btn = btnRef.current?.querySelector<HTMLElement>('div[role="button"]')
              if (btn) btn.click()
            }, 80)
          }
        })
        .catch((e) => setError(e.message))
    }
  }

  // Initial session check + optional 3DS redirect confirmation
  useEffect(() => {
    api
      .getMe()
      .then(async (r) => {
        setClientId(r.googleClientId)
        setUser(r.user)
        if (r.user) {
          await loadSubscription()
          const returnedCheckoutId = readCheckoutIdFromQuery()
          if (returnedCheckoutId) {
            await confirmAndApply(returnedCheckoutId)
            window.history.replaceState({}, '', '/account')
          }
        }
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
        initAndRenderGsiButton(clientId, btnRef.current, handleLoginCredential)
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

  // Mount SumUp Payment Widget whenever activeCheckout is set
  useEffect(() => {
    if (!activeCheckout) return
    let cancelled = false
    setError('')

    mountSumUpCard({
      elementId: 'sumup-card',
      checkoutId: activeCheckout.checkoutId,
      email: user?.email,
      amount: activeCheckout.recurring ? undefined : activeCheckout.amount,
      onResponse: (type, body) => {
        if (cancelled) return
        if (type === 'success') {
          try {
            widgetRef.current?.unmount()
          } catch {
            /* ignore */
          }
          widgetRef.current = null
          void confirmAndApply(activeCheckout.checkoutId)
        } else if (type === 'error' || type === 'fail') {
          const msg = body?.message || 'Die Zahlung wurde abgebrochen oder abgelehnt.'
          setError(msg)
        }
      },
    })
      .then((inst) => {
        if (cancelled) {
          inst.unmount()
          return
        }
        widgetRef.current = inst
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })

    return () => {
      cancelled = true
      if (widgetRef.current) {
        try {
          widgetRef.current.unmount()
        } catch {
          /* ignore */
        }
        widgetRef.current = null
      }
    }
  }, [activeCheckout?.checkoutId])

  // Poll instance provisioning until everything is done (for dedicated cloud tier)
  const provisioning =
    sub?.tier === 'cloud' &&
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

  const onBookFree = (e: Event) => {
    e.preventDefault()
    run(async () => {
      if (sub) {
        const r = await api.switchToFree(instance ? undefined : name || undefined)
        applySnapshot(r)
        setInfo(r.message)
        setShowPlanPicker(false)
      } else {
        const r = await api.bookFree(name)
        applySnapshot(r)
        setShowPlanPicker(false)
      }
    })
  }

  const onStartPaidCheckout = (e: Event, plan: 'cloud' | 'onprem') => {
    e.preventDefault()
    run(async () => {
      const needsName = plan === 'cloud' && !instance
      const chk = await api.createBillingCheckout(plan, needsName ? name : undefined)
      setActiveCheckout({
        checkoutId: chk.checkoutId,
        plan: chk.plan,
        amount: chk.amount,
        recurring: chk.recurring,
      })
    })
  }

  const onExtend = () =>
    run(async () => {
      const r = await api.extendSubscription()
      setInfo(r.message)
      await loadSubscription()
    })

  const onCancelAutoRenew = () =>
    run(async () => {
      const r = await api.cancelAutoRenew()
      setSub(r.subscription)
      setInfo(r.message)
    })

  const onResumeAutoRenew = () =>
    run(async () => {
      const r = await api.resumeAutoRenew()
      setSub(r.subscription)
      setInfo(r.message)
    })

  const onLogout = () =>
    run(async () => {
      clearUserAction()
      setFedcmBlocked(false)
      setActiveCheckout(null)
      await api.logout()
      setUser(null)
      setSub(null)
      setInstance(null)
    })

  const onCopyLicense = async () => {
    if (!sub?.licenseKey) return
    try {
      await navigator.clipboard.writeText(sub.licenseKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const nameHint = {
    idle: '3–63 Zeichen: Kleinbuchstaben, Ziffern, Bindestriche (nicht am Anfang/Ende).',
    checking: 'Prüfe Verfügbarkeit …',
    free: 'Name ist verfügbar.',
    taken: 'Name ist bereits vergeben.',
    invalid: 'Ungültiger Name.',
  }[nameState]

  const needsInstanceName =
    (selectedPlan === 'free' && !sub) || (selectedPlan === 'cloud' && !instance)

  return (
    <div class="account-page">
      <header class="account-header">
        <Link class="logo" href="/">
          <span class="logo-mark" aria-hidden="true" />
          QuixPOS
        </Link>
        <div class="account-user">
          <Link class="acc-nav-link" href="/preise">
            Preise
          </Link>
          {user && (
            <>
              {user.picture && (
                <img
                  src={api.pictureSrc(user.picture)}
                  alt={user.email}
                  title={user.email}
                  width="32"
                  height="32"
                />
              )}
              <button class="acc-btn secondary" onClick={onLogout} disabled={busy}>
                Abmelden
              </button>
            </>
          )}
        </div>
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
            {readPlanFromQuery() ? (
              <p>
                Gewählter Tarif: <strong>{TIER_LABELS[selectedPlan]}</strong>. Melde dich mit
                deinem Google-Konto an, um fortzufahren.
              </p>
            ) : (
              <p>Melde dich mit deinem Google-Konto an, um deine Kasse zu buchen oder zu verwalten.</p>
            )}
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
        ) : (
          <>
            {sub && (
              <>
                <section class="acc-card">
                  <div class="acc-card-head">
                    <h2>Aktiver Tarif</h2>
                    <button
                      type="button"
                      class="acc-btn secondary"
                      onClick={() => {
                        setActiveCheckout(null)
                        setShowPlanPicker((v) => !v)
                      }}
                    >
                      {showPlanPicker ? 'Schließen' : 'Tarif wechseln'}
                    </button>
                  </div>
                  <p>
                    <strong>{TIER_LABELS[sub.tier]}</strong> · gültig bis{' '}
                    <strong>{fmtDate(sub.validUntil)}</strong>
                  </p>

                  {sub.tier === 'cloud' && (
                    <div class="acc-sub-meta">
                      {sub.cardLast4 && (
                        <p class="hint">
                          Zahlungsmittel: {sub.cardType || 'Karte'} •••• {sub.cardLast4} ·{' '}
                          {sub.autoRenew
                            ? 'Automatische monatliche Verlängerung aktiv'
                            : 'Kündigung vorgemerkt (keine weitere Abbuchung)'}
                        </p>
                      )}
                      <div class="acc-btn-row">
                        {sub.autoRenew ? (
                          <button
                            type="button"
                            class="acc-btn secondary"
                            onClick={onCancelAutoRenew}
                            disabled={busy}
                          >
                            Abo kündigen
                          </button>
                        ) : sub.hasSavedCard ? (
                          <button
                            type="button"
                            class="acc-btn"
                            onClick={onResumeAutoRenew}
                            disabled={busy}
                          >
                            Verlängerung wieder aktivieren
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {sub.tier === 'free' && (
                    <button
                      type="button"
                      class="acc-btn"
                      onClick={onExtend}
                      disabled={busy || !api.isExtendEligible(sub.validUntil)}
                      title="Verlängerung ist 3 Monate vor Ablauf möglich"
                    >
                      Um 6 Monate verlängern
                    </button>
                  )}
                </section>

                {sub.licenseKey && (
                  <section class="acc-card">
                    <h2>On-Premise Lizenz</h2>
                    <p class="hint">
                      Updates &amp; persönlicher Support gültig bis{' '}
                      <strong>{fmtDate(sub.onpremUpdatesUntil || sub.validUntil)}</strong>
                    </p>
                    <div class="acc-license-row">
                      <code class="acc-license-code">{sub.licenseKey}</code>
                      <button type="button" class="acc-btn secondary" onClick={onCopyLicense}>
                        {copiedKey ? 'Kopiert ✓' : 'Kopieren'}
                      </button>
                    </div>
                    <p style={{ marginTop: '0.85rem', marginBottom: 0 }}>
                      <Link class="acc-btn secondary" href="/docs/downloads-releases">
                        Downloads &amp; Installationsanleitung →
                      </Link>
                    </p>
                  </section>
                )}

                {sub.tier === 'free' ? (
                  <section class="acc-card">
                    <h2>Instanz: &quot;dash.quixpos.com&quot;</h2>
                    <p>Account &quot;{user.email}&quot;</p>
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
                ) : sub.tier === 'cloud' && instance ? (
                  <section class="acc-card">
                    <h2>Eigene Cloud-Instanz: {instance.name}</h2>
                    <ul class="acc-states">
                      <li>Domain: <span class={`pill ${instance.domainstate}`}>{instance.domainstate}</span></li>
                      <li>Zertifikat: <span class={`pill ${instance.certstate}`}>{instance.certstate}</span></li>
                      <li>Docker: <span class={`pill ${instance.dockerstate}`}>{instance.dockerstate}</span></li>
                    </ul>
                    {provisioning && <p class="hint">Wird eingerichtet – Status wird automatisch aktualisiert.</p>}
                  </section>
                ) : null}
              </>
            )}

            {(!sub || showPlanPicker) && (
              <section class="acc-card">
                <h2>{sub ? 'Tarif wechseln' : 'Tarif wählen'}</h2>
                <div class="acc-plan-tabs" role="tablist" aria-label="Tarifauswahl">
                  {(['free', 'cloud', 'onprem'] as Tier[]).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      role="tab"
                      aria-selected={selectedPlan === tier}
                      class={`acc-plan-tab${selectedPlan === tier ? ' is-selected' : ''}`}
                      disabled={Boolean(activeCheckout)}
                      onClick={() => {
                        setSelectedPlan(tier)
                        setError('')
                      }}
                    >
                      <span class="acc-plan-tab-name">
                        {tier === 'free'
                          ? 'Geteilte Cloud'
                          : tier === 'cloud'
                            ? 'Eigene Cloud'
                            : 'On-Premise'}
                      </span>
                      <span class="acc-plan-tab-price">
                        {tier === 'free'
                          ? '0 €'
                          : tier === 'cloud'
                            ? '9,90 € / Monat'
                            : '99 € einmalig'}
                      </span>
                    </button>
                  ))}
                </div>

                {activeCheckout ? (
                  <div class="acc-checkout-box">
                    <div class="acc-checkout-head">
                      <div>
                        <strong>
                          {activeCheckout.plan === 'cloud'
                            ? 'Eigene Cloud-Instanz – 9,90 € / Monat'
                            : 'On-Premise – 99,00 € einmalig'}
                        </strong>
                        <p class="hint" style={{ margin: '0.25rem 0 0' }}>
                          {activeCheckout.plan === 'cloud'
                            ? 'SumUp prüft deine Karte per 1,00 € Autorisierung (wird sofort erstattet) und bucht anschließend monatlich 9,90 € ab. Jederzeit im Konto kündbar.'
                            : 'Einmalzahlung über SumUp – beinhaltet 1 Jahr Updates und persönlichen Support.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="acc-btn secondary"
                        disabled={confirmingPayment}
                        onClick={() => setActiveCheckout(null)}
                      >
                        Abbrechen
                      </button>
                    </div>

                    {confirmingPayment ? (
                      <p class="acc-msg ok">Zahlung wird bei SumUp bestätigt …</p>
                    ) : (
                      <div id="sumup-card" class="acc-sumup-mount" />
                    )}
                  </div>
                ) : selectedPlan === 'free' ? (
                  <form onSubmit={onBookFree}>
                    {sub?.tier === 'free' ? (
                      <p class="hint">Du nutzt bereits die kostenlose Geteilte Cloud-Instanz.</p>
                    ) : (
                      <>
                        {needsInstanceName && (
                          <>
                            <label for="inst-name">Name deiner Instanz</label>
                            <input
                              id="inst-name"
                              value={name}
                              onInput={(e) => setName((e.target as HTMLInputElement).value.toLowerCase())}
                              placeholder="mein-laden"
                              autocomplete="off"
                            />
                            <p class={`hint ${nameState}`}>{nameHint}</p>
                          </>
                        )}
                        <button
                          class="acc-btn"
                          type="submit"
                          disabled={busy || (needsInstanceName && nameState !== 'free')}
                        >
                          {sub ? 'Zu Geteilte Cloud-Instanz wechseln' : 'Kostenlos buchen'}
                        </button>
                      </>
                    )}
                  </form>
                ) : selectedPlan === 'cloud' ? (
                  <form onSubmit={(e) => onStartPaidCheckout(e, 'cloud')}>
                    <p class="hint">
                      Dedizierte Cloud-Instanz mit fest reservierten Ressourcen und planbaren
                      Updates. 9,90 € / Monat per Karte über SumUp, jederzeit kündbar.
                    </p>
                    {!sumupConfigured && (
                      <p class="acc-msg warning">
                        SumUp ist auf dem Server noch nicht konfiguriert (`SUMUP_API_KEY` fehlt).
                      </p>
                    )}
                    {needsInstanceName && (
                      <>
                        <label for="inst-name">Gewünschter Name deiner Instanz</label>
                        <input
                          id="inst-name"
                          value={name}
                          onInput={(e) => setName((e.target as HTMLInputElement).value.toLowerCase())}
                          placeholder="mein-laden"
                          autocomplete="off"
                        />
                        <p class={`hint ${nameState}`}>{nameHint}</p>
                      </>
                    )}
                    {instance && (
                      <p class="hint">
                        Vorhandener Instanzname wird weiterverwendet: <strong>{instance.name}</strong>
                      </p>
                    )}
                    <button
                      class="acc-btn"
                      type="submit"
                      disabled={busy || !sumupConfigured || (needsInstanceName && nameState !== 'free')}
                    >
                      Weiter zur Zahlung (9,90 € / Monat)
                    </button>
                  </form>
                ) : (
                  <form onSubmit={(e) => onStartPaidCheckout(e, 'onprem')}>
                    <p class="hint">
                      Installation auf AWS t3.small, Raspberry oder Windows Service (Windows, Linux
                      oder Mac). 99 € einmalig, beinhaltet 1 Jahr Updates und persönlichen Support.
                    </p>
                    {!sumupConfigured && (
                      <p class="acc-msg warning">
                        SumUp ist auf dem Server noch nicht konfiguriert (`SUMUP_API_KEY` fehlt).
                      </p>
                    )}
                    <button
                      class="acc-btn"
                      type="submit"
                      disabled={busy || !sumupConfigured}
                    >
                      Weiter zur Zahlung (99,00 €)
                    </button>
                  </form>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default AccountRoute
