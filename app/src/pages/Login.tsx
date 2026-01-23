import { useState, useEffect, FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, Input, FormField, Onboarding } from '@/components'
import { useAuth } from '@/hooks/useAuth'

const ONBOARDING_SEEN_KEY = 'wwuwh_onboarding_seen'

interface FormErrors {
  email?: string
  password?: string
  general?: string
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

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

  // Get redirect destination from location state, default to /app
  const from = (location.state as { from?: string })?.from || '/app'

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    setLoading(true)
    setErrors({})

    const { error } = await signIn(email, password)

    if (error) {
      setLoading(false)
      // Map Supabase errors to user-friendly messages
      if (error.message.includes('Invalid login credentials')) {
        setErrors({ general: 'Invalid email or password. Please try again.' })
      } else if (error.message.includes('Email not confirmed')) {
        setErrors({ general: 'Please check your email and confirm your account.' })
      } else {
        setErrors({ general: error.message })
      }
      return
    }

    // Success - redirect to intended destination
    navigate(from, { replace: true })
  }

  // Don't render anything until we've checked localStorage
  if (!onboardingChecked) {
    return null
  }

  // Show onboarding for first-time visitors
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/assets/logo.png" alt="WWUWH" />
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Sign In</h1>
          <p className="auth-subtitle">Welcome back to WWUWH</p>
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
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
          </FormField>

          {/* TODO: STAGE 5+ - Implement forgot password flow */}
          <div style={{ textAlign: 'right', marginTop: '-0.5rem' }}>
            <Link
              to="/app/forgot-password"
              style={{ fontSize: 'var(--text-sm)', color: 'var(--grey-500)' }}
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Sign In
          </Button>
        </form>

        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/app/signup">Create one</Link>
        </div>
      </div>
    </div>
  )
}
