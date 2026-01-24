import { useState, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, FormField, Onboarding } from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const ONBOARDING_SEEN_KEY = 'wwuwh_onboarding_seen'

interface FormErrors {
  email?: string
  password?: string
  confirmPassword?: string
  general?: string
}

export function Signup() {
  const { signUp } = useAuth()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [success, setSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [changingEmail, setChangingEmail] = useState(false)

  // Check if user has seen onboarding
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(ONBOARDING_SEEN_KEY)
    if (!hasSeenOnboarding) {
      setShowOnboarding(true)
    }
    setOnboardingChecked(true)
  }, [])

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true')
    setShowOnboarding(false)
  }

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = 'Password must contain at least one uppercase letter'
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = 'Password must contain at least one number'
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

    const { error } = await signUp(email, password)

    if (error) {
      setLoading(false)
      // Map Supabase errors to user-friendly messages
      if (error.message.includes('already registered')) {
        setErrors({ general: 'An account with this email already exists.' })
      } else {
        setErrors({ general: error.message })
      }
      return
    }

    // Success - show confirmation message
    setLoading(false)
    setSuccess(true)
  }

  const handleResendEmail = async () => {
    setResending(true)
    setResendError(null)
    setResendSuccess(false)

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })

    setResending(false)

    if (error) {
      setResendError(error.message)
    } else {
      setResendSuccess(true)
    }
  }

  const handleChangeEmail = () => {
    // Reset to form state so user can enter a different email
    setSuccess(false)
    setResendSuccess(false)
    setResendError(null)
    setPassword('')
    setConfirmPassword('')
    setChangingEmail(true)
  }

  // Don't render anything until we've checked localStorage
  if (!onboardingChecked) {
    return null
  }

  // Show onboarding for first-time visitors
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  if (success) {
    return (
      <div className="auth-layout">
        <div className="auth-card auth-card--confirmation">
          <div className="auth-logo">
            <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="WWUWH" />
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Check Your Email</h1>
            <p className="auth-subtitle">We've sent you a confirmation link</p>
          </div>

          <div className="confirmation-content">
            <div className="alert alert-success">
              <p>
                A confirmation email has been sent to:
              </p>
              <p className="confirmation-email">
                <strong>{email}</strong>
              </p>
              <p>
                Click the link in the email to activate your account.
              </p>
            </div>

            {resendSuccess && (
              <div className="alert alert-success" style={{ marginTop: 'var(--space-sm)' }}>
                Email sent! Check your inbox (and spam folder).
              </div>
            )}

            {resendError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--space-sm)' }}>
                {resendError}
              </div>
            )}

            <div className="confirmation-actions">
              <Button
                variant="secondary"
                onClick={handleResendEmail}
                loading={resending}
                disabled={resendSuccess}
                fullWidth
              >
                {resendSuccess ? 'Email Sent' : 'Resend Email'}
              </Button>

              <Button
                variant="ghost"
                onClick={handleChangeEmail}
                fullWidth
              >
                Use Different Email
              </Button>
            </div>

            <p className="confirmation-hint">
              Didn't receive it? Check your spam folder or try resending.
            </p>
          </div>

          <div className="auth-divider">or</div>

          <div className="auth-footer">
            <Link to="/app/login" className="confirmation-signin-link">
              Back to Sign In
            </Link>
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
          <h1 className="auth-title">{changingEmail ? 'Change Email' : 'Create Account'}</h1>
          <p className="auth-subtitle">{changingEmail ? 'Enter a different email address' : 'Join West Wickham UWH'}</p>
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

          <FormField
            label="Password"
            htmlFor="password"
            required
            error={errors.password}
            hint="At least 8 characters, one uppercase letter, and one number"
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!errors.password}
              aria-describedby={
                errors.password ? 'password-error' : 'password-hint'
              }
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
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword ? 'confirmPassword-error' : undefined
              }
            />
          </FormField>

          <Button type="submit" fullWidth loading={loading}>
            Create Account
          </Button>

          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--grey-500)',
              textAlign: 'center',
            }}
          >
            By creating an account, you agree to our{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </p>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/app/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
