import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, FormField } from '@/components'
import { supabase } from '@/lib/supabase'

interface FormErrors {
  email?: string
  general?: string
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [sent, setSent] = useState(false)

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    setLoading(true)
    setErrors({})

    // Determine redirect URL based on environment
    const isCapacitor = typeof window !== 'undefined' &&
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

    // For iOS app, redirect to web version since deep links need special setup
    const redirectTo = isCapacitor
      ? 'https://wwuwh.com/app/reset-password'
      : `${window.location.origin}/app/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    setLoading(false)

    if (error) {
      setErrors({ general: error.message })
      return
    }

    setSent(true)
  }

  // Success state - email sent
  if (sent) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-logo">
            <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Check Your Email</h1>
            <p className="auth-subtitle">We've sent you a password reset link</p>
          </div>

          <div style={{
            background: 'var(--color-success-light)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            textAlign: 'center',
            color: 'var(--color-success)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-md)'
          }}>
            <p>
              We've sent a password reset link to <strong>{email}</strong>
            </p>
            <p style={{ marginTop: 'var(--space-xs)', color: 'var(--grey-500)' }}>
              Click the link in the email to reset your password. The link will expire in 1 hour.
            </p>
          </div>

          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--grey-500)',
            textAlign: 'center',
            marginBottom: 'var(--space-md)'
          }}>
            Didn't receive the email? Check your spam folder or{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-water)',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                textDecoration: 'underline'
              }}
            >
              try again
            </button>
          </p>

          <div className="auth-footer">
            <Link to="/app/login">Back to Sign In</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Reset Password</h1>
          <p className="auth-subtitle">Enter your email to receive a reset link</p>
        </div>

        {errors.general && (
          <div className="alert alert-error" role="alert">
            {errors.general}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <FormField
            label="Email"
            htmlFor="email"
            required
            error={errors.email}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
          </FormField>

          <Button type="submit" fullWidth loading={loading}>
            Send Reset Link
          </Button>
        </form>

        <div className="auth-footer" style={{ marginTop: 'var(--space-lg)' }}>
          <Link to="/app/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  )
}
