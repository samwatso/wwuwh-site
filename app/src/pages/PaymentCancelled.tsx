/**
 * PaymentCancelled Page
 *
 * Simple page shown when user cancels Stripe payment.
 * Displayed in the in-app browser on iOS - user taps "Done" to return to app.
 */

export function PaymentCancelled() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: 'var(--space-md) 0'
        }}>
          {/* Info Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--grey-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-md)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--grey-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-navy)',
            margin: '0 0 var(--space-sm)'
          }}>
            Payment Cancelled
          </h1>

          <p style={{
            fontSize: 'var(--text-base)',
            color: 'var(--grey-600)',
            margin: '0 0 var(--space-lg)'
          }}>
            No payment was taken. You can try again anytime.
          </p>

          <div style={{
            background: 'var(--grey-100)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            width: '100%'
          }}>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--grey-700)',
              margin: 0
            }}>
              <strong>Tap "Done"</strong> in the top corner to return to the app.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
