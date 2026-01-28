import { Navigate, Outlet } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { Spinner } from './Spinner'
import styles from './AuthGuard.module.css'

/**
 * AdminGuard - Protects routes that require admin permissions
 * Redirects to dashboard if user has no admin-level permissions
 */
export function AdminGuard() {
  const { canAccessAdmin, loading } = usePermissions()

  // Show loading spinner while checking permissions
  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
        <p className={styles.loadingText}>Loading...</p>
      </div>
    )
  }

  // No admin permissions - redirect to dashboard
  if (!canAccessAdmin) {
    return <Navigate to="/app" replace />
  }

  // Has permissions - render child routes
  return <Outlet />
}
