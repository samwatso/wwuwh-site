import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from './Spinner'
import styles from './AuthGuard.module.css'

/**
 * AuthGuard - Protects routes that require authentication
 * Redirects to login if no valid session exists
 */
export function AuthGuard() {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
        <p className={styles.loadingText}>Loading...</p>
      </div>
    )
  }

  // Not authenticated - redirect to login with return path
  if (!user) {
    return <Navigate to="/app/login" state={{ from: location.pathname }} replace />
  }

  // Authenticated - render child routes
  return <Outlet />
}

/**
 * GuestGuard - Redirects authenticated users away from auth pages
 * (login, signup, etc.)
 */
export function GuestGuard() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    )
  }

  // Already authenticated - redirect to dashboard
  if (user) {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}
