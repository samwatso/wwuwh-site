import { Navigate, Outlet } from 'react-router-dom'
import { useAdmin } from '@/hooks/useAdmin'
import { Spinner } from './Spinner'
import styles from './AuthGuard.module.css'

/**
 * AdminGuard - Protects routes that require admin role
 * Redirects to dashboard if user is not an admin
 */
export function AdminGuard() {
  const { isAdmin, loading } = useAdmin()

  // Show loading spinner while checking admin status
  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
        <p className={styles.loadingText}>Loading...</p>
      </div>
    )
  }

  // Not admin - redirect to dashboard
  if (!isAdmin) {
    return <Navigate to="/app" replace />
  }

  // Admin - render child routes
  return <Outlet />
}
