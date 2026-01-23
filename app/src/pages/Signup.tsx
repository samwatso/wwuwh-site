import { useState, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, FormField, Onboarding } from '@/components'
import { useAuth } from '@/hooks/useAuth'

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
        <div className="auth-card">
          <div className="auth-logo">
            <img src="/assets/logo.png" alt="WWUWH" />
          </div>

          <div className="auth-header">
            <h1 className="auth-title">Check Your Email</h1>
            <p className="auth-subtitle">We've sent you a confirmation link</p>
          </div>

          <div className="alert alert-success">
            A confirmation email has been sent to <strong>{email}</strong>.
            Please click the link in the email to activate your account.
          </div>

          <div className="auth-footer" style={{ marginTop: 'var(--space-lg)' }}>
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
          <img src="/assets/logo.png" alt="WWUWH" />
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join West Wickham UWH</p>
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
