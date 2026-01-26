/**
 * PaymentSuccess Page
 *
 * Simple page shown after Stripe payment completes.
 * Displayed in the in-app browser on iOS - user taps "Done" to return to app.
 */

export function PaymentSuccess() {
  // Simple success page - no auth required
  // User taps "Done" to return to the app

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
          {/* Success Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--color-success-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-md)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
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
            Payment Complete
          </h1>

          <p style={{
            fontSize: 'var(--text-base)',
            color: 'var(--grey-600)',
            margin: '0 0 var(--space-lg)'
          }}>
            Your payment has been processed successfully.
          </p>

          <div style={{
            background: 'var(--color-ice)',
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
