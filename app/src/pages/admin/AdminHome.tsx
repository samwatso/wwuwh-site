import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions'
import { Skeleton } from '@/components'
import styles from './AdminHome.module.css'

interface AdminTileProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  locked?: boolean
}

function AdminTile({ to, icon, title, description, locked }: AdminTileProps) {
  if (locked) {
    return (
      <div className={`${styles.card} ${styles.cardLocked}`}>
        <div className={styles.cardIcon}>{icon}</div>
        <h3 className={styles.cardTitle}>{title}</h3>
        <p className={styles.cardDesc}>{description}</p>
        <div className={styles.lockBadge}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>No access</span>
        </div>
      </div>
    )
  }

  return (
    <Link to={to} className={styles.card}>
      <div className={styles.cardIcon}>{icon}</div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDesc}>{description}</p>
    </Link>
  )
}

export function AdminHome() {
  const { memberships } = useProfile()
  const { loading, isAdmin, hasPermission, hasAnyPermission, canAccessAdmin } = usePermissions()
  const clubName = memberships[0]?.club_name || 'Club'

  // Permission checks for each tile
  const canViewMembers = isAdmin || hasPermission(PERMISSIONS.MEMBERS_VIEW)
  const canManageEvents = isAdmin || hasAnyPermission([PERMISSIONS.EVENTS_CREATE, PERMISSIONS.EVENTS_EDIT])
  const canManageGroups = isAdmin || hasPermission(PERMISSIONS.TEAMS_ASSIGN)
  const canViewBilling = isAdmin || hasPermission(PERMISSIONS.BILLING_VIEW)
  const canManageRoles = isAdmin || hasPermission(PERMISSIONS.ROLES_MANAGE)
  const canViewAudit = isAdmin // Audit log is admin-only

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Skeleton variant="text" width={180} height={28} />
          <Skeleton variant="text" width={120} height={16} className={styles.skeletonSubtitle} />
        </div>
        <div className={styles.grid}>
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={140} />
        </div>
      </div>
    )
  }

  // If user has no admin permissions at all, show access denied
  if (!canAccessAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>{clubName}</p>
        </div>
        <div className={styles.accessDenied}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2>Access Denied</h2>
          <p>You don't have permission to access the admin dashboard.</p>
          <p>Contact a club administrator if you need access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <p className={styles.subtitle}>{clubName}</p>
      </div>

      <div className={styles.grid}>
        <AdminTile
          to="/app/admin/members"
          locked={!canViewMembers}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          title="Members"
          description="View and manage club members"
        />

        <AdminTile
          to="/app/admin/events"
          locked={!canManageEvents}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          title="Events"
          description="Create and manage events"
        />

        <AdminTile
          to="/app/admin/groups"
          locked={!canManageGroups}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          }
          title="Groups"
          description="Manage teams and squads"
        />

        <AdminTile
          to="/app/admin/billing"
          locked={!canViewBilling}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
          title="Billing"
          description="Subscriptions and payments"
        />

        <AdminTile
          to="/app/admin/roles"
          locked={!canManageRoles}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
          title="Roles"
          description="Manage permissions"
        />

        <AdminTile
          to="/app/admin/audit"
          locked={!canViewAudit}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          }
          title="Audit Log"
          description="View activity history"
        />
      </div>
    </div>
  )
}
