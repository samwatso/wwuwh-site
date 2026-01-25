import { useState, useEffect, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, FormField } from '@/components'
import { supabase } from '@/lib/supabase'

interface FormErrors {
  password?: string
  confirmPassword?: string
  general?: string
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [success, setSuccess] = useState(false)
  const [validSession, setValidSession] = useState<boolean | null>(null)

  // Check if we have a valid recovery session from the email link
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      // Supabase automatically handles the recovery token from the URL hash
      // If there's a session after landing on this page, it means the recovery was valid
      if (session) {
        setValidSession(true)
      } else {
        // Listen for auth state change (Supabase processes the hash asynchronously)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY' && session) {
            setValidSession(true)
          } else if (event === 'SIGNED_IN' && session) {
            // User might already be signed in via recovery
            setValidSession(true)
          }
        })

        // Give it a moment, then check again
        setTimeout(async () => {
          const { data: { session: delayedSession } } = await supabase.auth.getSession()
          if (delayedSession) {
            setValidSession(true)
          } else {
            setValidSession(false)
          }
        }, 1000)

        return () => subscription.unsubscribe()
      }
    }

    checkSession()
  }, [])

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    setLoading(true)
    setErrors({})

    const { error } = await supabase.auth.updateUser({
      password: password,
    })

    setLoading(false)

    if (error) {
      setErrors({ general: error.message })
      return
    }

    setSuccess(true)

    // Redirect to dashboard after a short delay
    setTimeout(() => {
      navigate('/app', { replace: true })
    }, 2000)
  }

  // Loading state while checking session
  if (validSession === null) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-logo">
            <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
          </div>
          <div className="auth-header">
            <h1 className="auth-title">Reset Password</h1>
            <p className="auth-subtitle">Verifying your reset link...</p>
          </div>
        </div>
      </div>
    )
  }

  // Invalid or expired link
  if (validSession === false) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-logo">
            <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Link Expired</h1>
            <p className="auth-subtitle">This password reset link is no longer valid</p>
          </div>

          <div style={{
            background: 'var(--color-error-light)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            textAlign: 'center',
            color: 'var(--color-error)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-md)'
          }}>
            <p>
              The password reset link has expired or has already been used.
            </p>
            <p style={{ marginTop: 'var(--space-xs)', color: 'var(--grey-500)' }}>
              Please request a new password reset link.
            </p>
          </div>

          <Link to="/app/forgot-password">
            <Button fullWidth>Request New Link</Button>
          </Link>

          <div className="auth-footer" style={{ marginTop: 'var(--space-lg)' }}>
            <Link to="/app/login">Back to Sign In</Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <div className="auth-logo">
            <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Password Updated</h1>
            <p className="auth-subtitle">Your password has been reset successfully</p>
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
              Your password has been updated. Redirecting you to the app...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Main form
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Set New Password</h1>
          <p className="auth-subtitle">Enter your new password below</p>
        </div>

        {errors.general && (
          <div className="alert alert-error" role="alert">
            {errors.general}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <FormField
            label="New Password"
            htmlFor="password"
            required
            error={errors.password}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
          </FormField>

          <FormField
            label="Confirm Password"
            htmlFor="confirmPassword"
            required
            error={errors.confirmPassword}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
            />
          </FormField>

          <Button type="submit" fullWidth loading={loading}>
            Update Password
          </Button>
        </form>

        <div className="auth-footer" style={{ marginTop: 'var(--space-lg)' }}>
          <Link to="/app/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  )
}
