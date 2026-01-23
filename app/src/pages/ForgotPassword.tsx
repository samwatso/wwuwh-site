import { Link } from 'react-router-dom'

// TODO: STAGE 5+ - Implement full forgot password flow with Supabase
// supabase.auth.resetPasswordForEmail(email, { redirectTo: '...' })

export function ForgotPassword() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/assets/logo.png" alt="WWUWH" />
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">Coming soon</p>
        </div>

        <div style={{
          background: 'var(--color-ice)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          textAlign: 'center',
          color: 'var(--grey-500)',
          fontSize: 'var(--text-sm)'
        }}>
          <p>
            Password reset functionality will be available in a future update.
          </p>
          <p style={{ marginTop: 'var(--space-xs)' }}>
            For now, please contact the club administrator if you need to reset your password.
          </p>
        </div>

        <div className="auth-footer" style={{ marginTop: 'var(--space-lg)' }}>
          <Link to="/app/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  )
}
