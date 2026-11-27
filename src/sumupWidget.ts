declare global {
  interface Window {
    SumUpCard?: {
      mount: (config: Record<string, unknown>) => SumUpCardInstance
    }
  }
}

export interface SumUpCardInstance {
  submit: () => void
  unmount: () => void
  update: (cfg: Record<string, unknown>) => void
}

const SDK_URL = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js'
let loading: Promise<void> | null = null

export function loadSumUpSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.SumUpCard) return Promise.resolve()
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SDK_URL
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        loading = null
        reject(new Error('SumUp-Zahlungsformular konnte nicht geladen werden'))
      }
      document.head.appendChild(s)
    })
  }
  return loading
}

export async function mountSumUpCard(opts: {
  elementId: string
  checkoutId: string
  email?: string
  amount?: string
  onResponse: (type: string, body: any) => void
}): Promise<SumUpCardInstance> {
  await loadSumUpSdk()
  if (!window.SumUpCard) throw new Error('SumUp SDK nicht verfügbar')
  return window.SumUpCard.mount({
    id: opts.elementId,
    checkoutId: opts.checkoutId,
    locale: 'de-DE',
    country: 'DE',
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.amount ? { amount: opts.amount, currency: 'EUR' } : {}),
    onResponse: opts.onResponse,
  })
}
